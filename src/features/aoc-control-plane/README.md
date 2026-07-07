# AOC Control Plane UI

AOC is no longer just a protocol or a runtime -- Recognition Runtime, Authority
Graph, Approval Runtime, External Agent Handshake and Action Enforcement
together form an enforceable governance system. The Control Plane makes that
system *operable*: it is the surface a human operator uses to inspect,
understand and (where safe) act on what those five runtimes have decided.

It answers one question, repeatedly, across every governed action: **who did
what, under what authority, with what evidence, and did AOC actually allow
it?**

## Why a control plane, and why after enforcement

Once Action Enforcement exists, every action in the system either executed
because AOC allowed it, or never ran because AOC blocked it. That is a large
amount of decision state -- recognition decisions, authority chains, approval
quorums, external handshakes, enforcement outcomes, and the proofs chaining
them together -- with no way for a person to see it. The Control Plane is the
next required layer for exactly that reason: enforcement without visibility
is not governance an operator can trust or audit.

## Runtime logic vs. read-model/UI logic

This is the one rule every file in this module follows:

**The UI never reimplements governance logic.** It does not decide whether an
actor is recognized, whether authority is valid, whether an approval clears
quorum, whether a handshake should be trusted, or whether an action is
allowed to execute -- those five runtimes already decided all of that, and
their decision is final. This module only:

1. **Reads** runtime state through each runtime's own public getters, stores
   and event ledgers (`services/control-plane-read-model-service.ts`).
2. **Projects** that state into typed, UI-friendly view models
   (`domain/control-plane-view-model.ts`).
3. **Filters, sorts and searches** those view models
   (`services/control-plane-query-service.ts`).
4. **Dispatches** commands verbatim to the real runtime service that owns
   them (`services/control-plane-command-service.ts`) -- it never mutates a
   read-model array as if that were a state change.

If a row says an action was `allowed`, that is because
`EnforcementDecision.allowedToExecute` was `true` on the real
`EnforcementDecision` the Action Enforcement runtime returned. If a row says
an action was `executed`, that is because `ExecutionResult.executed` was
`true`. Nothing here is inferred or dramatized.

## The seven sections

### 1. Overview (`AocOverviewDashboard`)
Status cards (recognized actors, active grants/delegations, pending
approvals, active visas/ingress grants, enforcement requests, blocked
executions, executed actions, open violations, proofs generated), a health
banner (`healthy` / `attention_required` / `degraded` / `critical`), the most
recent decisions across all five sources, open items needing attention, and
a merged activity timeline.

### 2. Recognition (`RecognitionPanel`)
Recognized actors, passports, capability tokens, recognition decisions and
the raw audit trail -- everything Recognition Runtime decided about *"is
this actor and this action recognized?"*.

### 3. Authority (`AuthorityPanel`)
Authority grants, delegation grants, role assignments, authority decisions,
authority proofs, and a deterministic nested chain view (`AuthorityChainViewer`)
built from the grants/delegations themselves -- no graph library, just
issuer → subject → delegate, in order.

### 4. Approvals (`ApprovalPanel`)
Approval requests, decisions, evidence reviewed, quorum status
(`ApprovalQuorumIndicator`), and safe approve/reject/request-changes/escalate
actions.

### 5. External Agents (`ExternalAgentsPanel`)
External agents and their standing, handshake requests, agent visas, ingress
grants and the local trust boundary configuration that gated them.

### 6. Enforcement (`EnforcementPanel`)
Enforcement requests, decisions (with reasonCode/reason and links back to
the recognition/authority/approval/handshake proof that justified them),
execution results, side effects, violations, and idempotency status.

### 7. Proofs / Audit (`ProofsPanel`)
Proof references from all five runtimes, proof chains linking an
enforcement proof back through recognition, authority, approval and
handshake, hash/previousHash display, and the full audit trail.

## How read models are built

`ControlPlaneReadModelService.buildControlPlaneReadModel(bundle, options)`
takes a `ControlPlaneRuntimeBundle` -- handles to the five live runtimes plus
whatever entity ids a fixture (or a real integration) knows about -- and
produces one `AocControlPlaneReadModel`. Each sub-view-model is built by
calling that runtime's own read methods:

- Authority Graph, Approval Runtime and Action Enforcement all expose
  `store.getXByTrustDomain(...)`-style queries, so their grants/requests are
  enumerated directly.
- Authority decisions and proofs are additionally recovered via
  `AuthorityProofService.getAllProofs()`, since every authority decision --
  valid or not -- produces a proof, including ones Recognition Runtime
  triggers internally through its own Authority Graph integration.
- External Agent Handshake has no blanket "list all agents/visas" query, so
  agents are discovered from handshake requests and visas/ingress grants are
  discovered from the handshake event trail (`visaId`/`ingressGrantId` on
  each event), then re-fetched fresh by id for current state.
- Recognition Runtime exposes no "list all actors/passports/tokens" query at
  all -- the Control Plane fixture records which ids it created and the read
  model re-fetches each one fresh via `getActor`/`getPassport`/
  `getCapabilityToken`, so revocations made after fixture setup are reflected.
- Recognition Runtime's own audit trail persists a decision's `reasonCode`
  but not its original free-text `reason`; `RecognitionDecisionRow.reason` is
  therefore optional and left unset rather than guessing (an earlier version
  of this service incorrectly attached the *enforcement* decision's reason to
  the recognition row -- e.g. showing "idempotency key already used" as if
  Recognition Runtime had said it. That bug is why this row's `reason` field
  is optional now instead of backfilled).

## How metrics and health are computed

`ControlPlaneMetricsService.computeMetrics`/`computeHealth` take the
already-built view models (not raw runtime handles) and only count and
compare fields that are already there: `status === 'active'`,
`allowedToExecute === false`, `severity === 'critical'`, and so on. Health
escalates in this order: `emergencyDenyActive` or an open critical violation
→ `critical`; blocked executions, expired visas or revoked approvals →
`degraded`; pending approvals (especially high/critical risk) →
`attention_required`; otherwise `healthy`.

## How the timeline is built

`ControlPlaneTimelineService.buildTimeline` merges `AuditEvent`,
`AuthorityEvent`, `ApprovalEvent`, `HandshakeEvent` and `EnforcementEvent`
into one `AocTimelineItem[]`, normalizing each event's type into a title,
description and status (`info`/`success`/`warning`/`danger`) via a fixed
lookup table per event type -- no interpretation beyond that -- and sorts
newest-first (falling back to id for a stable tie-break).

## How proof chains are built and displayed

`ControlPlaneProofService.buildProofsViewModel` collects proof references
per source, then builds one `ProofChainRow` per enforcement proof by walking
the ids it already carries (`recognitionDecisionId`, `authorityProofId`,
`approvalProofId`, `handshakeProofId`). A chain is marked `complete` **only**
when every one of those referenced ids was actually found among the
collected proofs -- if Action Enforcement recorded a reference to a proof
this service could not resolve, the chain is `incomplete`, visibly.

## How commands work

`ControlPlaneCommandService` wraps the real runtime services and nothing
else:

| Command | Runtime call |
| --- | --- |
| `approve_approval_request` | `ApprovalRuntime.approve(...)` |
| `reject_approval_request` | `ApprovalRuntime.reject(...)` |
| `request_approval_changes` | `ApprovalRuntime.requestChanges(...)` |
| `escalate_approval` | `ApprovalRuntime.escalate(...)` |
| `revoke_approval_proof` | `ApprovalRuntime.revokeApproval({ approvalProofId, ... })` |
| `revoke_authority_grant` | `AuthorityGraphRuntime.revokeAuthorityGrant(...)` |
| `revoke_delegation_grant` | `AuthorityGraphRuntime.revokeDelegationGrant(...)` |
| `revoke_agent_visa` | `ExternalAgentHandshakeRuntime.revokeAgentVisa(...)` |
| `revoke_ingress_grant` | `ExternalAgentHandshakeRuntime.revokeIngressGrant(...)` |
| `dry_run_enforcement` | `AocGuard.enforce(input, () => undefined)` with `mode: 'dry_run'` |
| `retry_failed_enforcement` | **not wired** -- see below |

Every command returns a `ControlPlaneCommandResult` built from the real
return value of that call (decision reasonCode/reason, resulting proof id,
revocation timestamp pulled from the `RevocationLink`/proof/visa itself --
never a fabricated timestamp).

### What is disabled, and why

`retry_failed_enforcement` is always reported as unavailable
(`reasonCode: 'COMMAND_NOT_WIRED'`). Action Enforcement has no first-class
retry method: a retry is really "resubmit the original `execute()` callback
with the same idempotency key", and the Control Plane does not own that
callback. Every component that renders a command button (`ApprovalActionBar`,
`AuthorityGrantsTable`, `DelegationGrantsTable`, `AgentVisasTable`,
`IngressGrantsTable`) renders it **disabled with a tooltip**
(`"Command wiring not enabled in this read-only demo."`) whenever no handler
was supplied, rather than silently hiding it or faking success.

## How the demo/fixture state works

`fixtures/control-plane-demo.fixture.ts` builds one deterministic "Datasys
Agent Republic" world by:

1. Calling Action Enforcement's own `buildDatasysEnforcementFixture()`, which
   already wires all five runtimes together (this module does not rebuild
   that composition).
2. Directly exercising Authority Graph's `verifyAuthority` for two
   representative actions (one delegated and valid, one not delegated), the
   same way `authority-graph`'s own demo scenarios do.
3. Driving nine real scenarios through `AocGuard.enforce(...)`: an allowed
   and executed action, a pending-then-approved approval (plus a suppressed
   duplicate via the same idempotency key), an evidence-required denial, an
   unrecognized-actor denial, a completed external handshake and successful
   read, an adapter-denied action, and a dry run.
4. Revoking one capability token nobody else in the fixture depends on, so
   the Recognition panel has a genuine `revoked` row to show.

Every runtime call in that fixture is the *real* public API of its module --
nothing here reimplements a policy. **Limitation:** since the fixture is the
only currently-wired data source, `buildControlPlaneReadModel` only ever
reflects this one demo trust domain; a production integration would build
its own `ControlPlaneRuntimeBundle` from live runtime instances instead of
this fixture.

## Mounting the Control Plane

This backend package (`@aoc-enterprise/runtime`) has no existing frontend
app or bundler, so this module ships as **feature-local React components**
(`.tsx`, compiled via the same `tsc -b` project as the rest of `src/`, with
`jsx: "react-jsx"` added to `tsconfig.base.json` and `react`/`react-dom`
added as optional peer dependencies) rather than a full mounted application.
A consuming app wires it up like this:

```tsx
import { buildControlPlaneReadModel } from '@aoc-enterprise/runtime/dist/src/features/aoc-control-plane/services/control-plane-read-model-service.js';
import { AocControlPlanePage } from '@aoc-enterprise/runtime/dist/src/features/aoc-control-plane/components/AocControlPlanePage.js';

const readModel = buildControlPlaneReadModel(runtimeBundle);

<AocControlPlanePage
  readModel={readModel}
  commands={{
    onApproveApproval: (id) => commandService.approveApprovalRequest({ approvalRequestId: id, approverActorId }),
    // ...omit a handler to leave that command safely disabled
  }}
/>;
```

Recommended routes, matching the "prefer existing conventions" rule: mount
under `/aoc/control-plane`, or `/admin/aoc` / `/console/aoc` if the host app
has an admin or console area. This repository has no existing frontend app
route table to integrate into, so no route was registered here.

## Accessibility

- Every table uses `<th scope="col">`/`<th scope="row">` and an
  `aria-label` describing its contents.
- Every action button has visible text (never icon-only) and a `title`
  explaining its state, especially when disabled.
- Status/decision/risk badges (`AocDecisionBadge`, `AocRiskBadge`,
  `ExternalStandingBadge`) always pair color with a text label and symbol --
  color is never the only signal.
- Navigation tabs use `role="tablist"`/`role="tab"`/`aria-selected`.
- Error and empty states use `role="alert"`/`role="status"` respectively.

## Determinism

- `buildControlPlaneReadModel` takes an optional `now: () => string` for
  `generatedAt`; without it, `generatedAt` defaults to the demo world's own
  `trustDomain.updatedAt` rather than a wall-clock read.
- The demo fixture uses each runtime's injectable `ManualClock` /
  sequential id generator (the same pattern every other AOC module uses),
  so two independent builds of the fixture produce byte-identical output --
  verified directly in `tests/control-plane-read-model-service.test.ts`
  ("produces deterministic output for the same input").
- No service in this module reads the wall clock, generates random ids, or
  makes a model call. Every table, badge and detail view is a pure function
  of the read model it was given.

## Known limitations

- Recognition Runtime's audit trail does not persist a decision's free-text
  `reason`, only its `reasonCode`; `RecognitionDecisionRow.reason` and
  `AuthorityDecisionRow.reason` are optional for exactly this reason.
- Full DOM interaction tests (simulated clicks, typing) were intentionally
  not added -- this package has no `jsdom`/`@testing-library` dependency and
  adding one was judged not "clearly necessary" for an MVP. Component tests
  use `react-dom/server`'s `renderToStaticMarkup` instead, asserting on
  server-rendered markup across different prop-driven states (a controlled
  `initialSection`, hand-built row fixtures, etc.) rather than simulating
  clicks; this is documented here rather than silently skipped.
- `retry_failed_enforcement` is permanently disabled (see above) since
  Action Enforcement has no runtime API to back it without inventing new
  governance behavior.
