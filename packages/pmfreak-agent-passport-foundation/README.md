# PMFreak Agent Passport Foundation

## What this answers

PMFreak's conversational-brain agents (Planning, Risk, Evidence, Client
Communication, Billing Readiness, Change Control) need a real, verifiable Soberanía
identity -- not a narrow demo. This package wires PMFreak's six agent roles
to the actual, already-existing, generic **Agent Passport Core**
(`@aoc-enterprise/agent-governance`) instead of
`src/features/aoc-enterprise-demo/pmfreak-agent-passport`, which is
explicitly disclaimed in its own README as demo-only/non-production and has
no real issuance, signing, or evidence/approval-capability wiring.

Concretely, this package:

1. Issues **real** `AgentPassport`s (via `@aoc-enterprise/agent-governance`'s
   actual exported `issueAgentPassport`, `createTestSigner`,
   `createInMemoryAgentPassportStore`, `evaluateAgentRuntimeGuard`, etc.) for
   PMFreak's six known agent roles.
2. References -- but does not implement or import -- evidence, approval,
   and capability-token requirements via locally-defined **structural mirror
   types** (see "Why structural mirrors, not imports" below).
3. Resolves whether a specific action attempt is authorized --
   `resolvePMFreakAgentPassportAction` combines the real Runtime Guard Lite
   result with this package's capability-token, evidence-requirement,
   approval-requirement, and authority-scope checks into one
   priority-ordered decision (`allow` / `hold` / `deny` / a `require_*`
   review). See "Action resolution" below.
4. Adds a passport validation-status lattice mirroring
   `PolicyPackValidationStatus`'s 15-value trust lattice
   (`src/features/policy-pack-foundation`), and a new
   `PMFreakPassportAttestation` schema -- this repository had zero
   "AgentPassportAttestation" concept before this package.

## Why a new workspace package (not `src/features/*`)

The root `@aoc-enterprise/runtime` package's own source (`src/`, including
every `src/features/*` module -- evidence-source-runtime, approval-runtime,
recognition-runtime, policy-pack-foundation, the PMFreak demo pack, etc.) is
one TypeScript project that is publicly exported only via a handful of
`package.json` `"exports"` subpaths: `.`, `./authorization`, `./audit`,
`./crypto`, `./adapters`. None of `src/features/*` is in that map, so it has
no legitimate import path from a separate workspace package.
`packages/agent-governance`, by contrast, is a normal, real, separately
buildable workspace package already consumed by `apps/agent-passport-web`.
This package lives under `packages/` -- following the exact dependency
pattern `packages/control-plane-sdk` uses on `packages/policy-runtime`
(`"@aoc-enterprise/agent-governance": "file:../agent-governance"`) -- so it
can hold a real dependency on the real Agent Passport Core.

## Why structural mirrors, not imports

Evidence requirements, approval requirements, and capability tokens are real
concepts in this repository (`src/features/evidence-source-runtime`,
`src/features/approval-runtime`, `src/features/recognition-runtime`), but
none of those modules are part of the root package's public surface. Rather
than add root `package.json` exports for them (a much larger, riskier change
than intended for a foundation-layer sprint) or fabricate a fake
dependency, this package defines **local structural mirror types** --
`PMFreakEvidenceRequirementMirror`, `PMFreakApprovalRequirementMirror`,
`PMFreakCapabilityTokenMirror` -- whose field shapes are intentionally
identical to the real ones. Each mirror's file header explains, in a code
comment, exactly why it is a mirror and not an import (the same convention
already used in `src/features/evidence-source-runtime/integrations/action-enforcement-evidence-integration.ts`).
The `PMFreakPassportValidationStatus` lattice mirrors
`PolicyPackValidationStatus` the same way.

Runtime Guard Lite (`evaluateAgentRuntimeGuard`/`enforceAgentRuntimeGuard`)
is different: it genuinely is exported from `@aoc-enterprise/agent-governance`'s
public surface, so this package calls it for real -- there is no mirror for
runtime enforcement.

## Action resolution

`resolvePMFreakAgentPassportAction` ports the demo pack's
`resolvePMFreakAgentPassportAction`
(`src/features/aoc-enterprise-demo/pmfreak-agent-passport/pmfreak-passport-resolver.ts`)
decision logic onto this package's real dependencies. It is not a copy: the
demo resolver looks up a passport's flat `allowedActionIds`/authority-scope
booleans and evidence/approval **id lists** from an in-memory registry; this
package's resolver instead (a) calls the real `evaluateAgentRuntimeGuard`
for passport/policy-manifest/tool/data/risk-tier gating, and (b) separately
resolves this package's own `PMFreakCapabilityTokenMirror`,
`PMFreakEvidenceRequirementMirror`, and `PMFreakApprovalRequirementMirror`
objects (plus a freshly-authored `PMFreakAuthorityScope`, since
`AgentPassport` carries no workspace/project/customer/phase scoping of its
own) to determine capability, evidence, and approval satisfaction. Both
signals feed the same priority-ordered decision set the demo pack uses
(`deny > require_legal_review > ... > require_evidence > hold > allow`), so
the *vocabulary* callers see is unchanged even though the *inputs* are now
real. See `domain/pmfreak-passport-action-decision.ts` and
`services/pmfreak-agent-passport-resolution-service.ts`.

## What this package does NOT do

- No real evidence/approval/capability-token *enforcement engine* beyond
  `resolvePMFreakAgentPassportAction`'s satisfaction checks -- there is
  still no code anywhere that actually collects evidence, records an
  approval, or issues a capability token; those objects must be
  caller-supplied.
- No real cryptographic signing keys. Passport issuance defaults to
  `@aoc-enterprise/agent-governance`'s own `createTestSigner`, whose own
  code comment marks it "for use in tests; not for production use" -- an
  intentional choice, since this whole package is a non-production
  foundation layer.
- No real persistence beyond `@aoc-enterprise/agent-governance`'s own
  `createInMemoryAgentPassportStore`.
- No network calls, no `fetch`, no `process.env` reads, no database.
- No production wiring into `apps/agent-passport-web` or any other app.
- No dependency on, or import from, `src/features/aoc-enterprise-demo/pmfreak-agent-passport`
  (that would be a foundation package depending on a demo feature,
  backwards).

## Determinism guarantees

- Every function in this package that produces a timestamp takes it as a
  caller-supplied parameter (`issuedAt`, `attestedAt`, `requestedAt`, a
  `now()` dependency for the runtime guard) -- this package's own code never
  reads the system clock, and there is no `Math.random()`/`Date.now()`/bare
  `new Date()` anywhere in `src/` or `__tests__/` (enforced by
  `pmfreak-structural-mirrors.test.ts`'s source scan).
- `createPMFreakPassportAttestation`'s `attestationId` and `subjectHash` are
  both derived solely from caller-supplied input via
  `@aoc-enterprise/agent-governance`'s real `canonicalizeJson`/`sha256Hex`
  (canonical JSON + SHA-256, exactly the scheme the passport itself uses):
  identical input always yields an identical attestation.
- The underlying passport's constitution, policy manifest, and every hash
  derived from them are byte-for-byte reproducible given the same
  enrollment input (they are canonical-JSON + SHA-256 over caller-supplied
  data). The passport ID's random entropy suffix and the test signer's
  `signedAt` timestamp are randomized / wall-clock-derived by
  `@aoc-enterprise/agent-governance` itself (`generateAgentPassportId`,
  `createTestSigner`) and are therefore not reproducible across separate
  issuance calls -- that is a property of the real, upstream dependency,
  not something this package overrides.
- No `fetch`, no network, no database, no filesystem access outside this
  package's own test suite's source-scanning tests (which only read this
  package's own `.ts` files to assert isolation).

## Layout

| Path | Provides |
| --- | --- |
| `domain/pmfreak-agent-role.ts` | `PMFreakAgentRole` (6 roles) and `PMFreakAgentRoleProfile` metadata type |
| `domain/pmfreak-passport-validation-status.ts` | The 15-value `PMFreakPassportValidationStatus` lattice and `satisfiesPMFreakPassportValidationStatus` |
| `domain/pmfreak-passport-attestation.ts` | `PMFreakPassportAttestation` -- new work, no prior concept in this repo |
| `domain/pmfreak-evidence-requirement-mirror.ts` | Structural mirror of `EvidenceRequirement` |
| `domain/pmfreak-approval-requirement-mirror.ts` | Structural mirror of `ApprovalRequirement` |
| `domain/pmfreak-capability-token-mirror.ts` | Structural mirror of `RecognitionCapabilityToken` |
| `domain/pmfreak-authority-scope.ts` | Fresh, self-authored `PMFreakAuthorityScope`/`PMFreakProjectPhase` model and scope-check helpers |
| `domain/pmfreak-passport-action-decision.ts` | `PMFreakPassportActionDecision` and its priority ordering |
| `services/pmfreak-agent-enrollment-builder.ts` | `buildPMFreakAgentEnrollmentInput` -- builds a real `AgentEnrollmentInput` |
| `services/pmfreak-agent-passport-issuance-service.ts` | `issuePMFreakAgentPassport` -- wraps the real `issueAgentPassport` end to end |
| `services/pmfreak-agent-runtime-guard-service.ts` | Builds a real `AgentRuntimeActionRequest` and calls the real Runtime Guard Lite |
| `services/pmfreak-agent-passport-resolution-service.ts` | `resolvePMFreakAgentPassportAction` -- the action decision engine (see "Action resolution") |
| `services/pmfreak-passport-attestation-service.ts` | `createPMFreakPassportAttestation` |
| `fixtures/pmfreak-agent-role-fixtures.ts` | Fresh, self-authored role profiles for the six PMFreak roles |
| `fixtures/pmfreak-passport-scenario-fixtures.ts` | Deterministic full enrollment scenarios per role, for this package's own tests |

## Future work

Before any of this could move beyond foundation stage:

- Export `evidence-source-runtime`, `approval-runtime`,
  `recognition-runtime`, and `policy-pack-foundation` from the root
  package's public surface (or otherwise give this package a legitimate
  import path to them), then replace the structural mirrors in `domain/`
  with real imports.
- Build a real signer (replacing `createTestSigner`) and a real persistent
  store (replacing `createInMemoryAgentPassportStore`).
- Migrate `src/features/aoc-enterprise-demo/pmfreak-project-governance-scenarios`
  and `src/features/aoc-enterprise-demo/pmfreak-demo-control-plane-view` --
  the demo pack's only two consumers -- onto
  `resolvePMFreakAgentPassportAction`, reconciling their demo-domain role
  literals (e.g. `'planning_agent'`) and id-list evidence/approval model
  with this package's shapes. Not done in this sprint: both directories are
  demo-only and not consumed by any app, so this is a larger, separate,
  higher-risk follow-up rather than part of the foundation-layer work here.
- Decide how (and whether) to wire this into `apps/agent-passport-web` or a
  PMFreak-facing surface -- out of scope for this sprint.
