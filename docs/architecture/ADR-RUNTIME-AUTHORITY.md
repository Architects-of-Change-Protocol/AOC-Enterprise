# ADR: AOC Runtime Authority v1 (vertical slice)

- Status: Accepted (vertical slice; see "Known limitations" for what is
  deliberately not built yet)
- Deciders: AOC Enterprise architecture
- Related: `ADR-ENTERPRISE-GOVERNANCE-STORE.md`, `ADR-EVIDENCE-BUNDLE.md`,
  `ADR-AGENT-PASSPORT-RUNTIME.md`, `ADR-ASSURANCE-RUNTIME.md`,
  `docs/enterprise/AOC_RUNTIME_AUTHORITY_MODEL.md`,
  `docs/enterprise/AOC_AGENT_PASSPORT_CURRENT_MODEL.md`

## Context

AOC Enterprise already has substantial, real governance infrastructure:
`AgentPassport` (identity/lifecycle, `src/enterprise/passport/`), an
in-process enforcement guard (`src/features/action-enforcement`), authority
delegation with per-grant suspend/revoke (`src/features/authority-graph`),
policy evaluation (`domain-policy-pack-runtime`), and hash-chained
verifiable evidence export (`verifiable-export-package`). A pre-work audit
(see the repo's session history) found all of it real, not stubbed --
and found one specific, concrete gap: nothing in the repository could
**pause an already-running agent runtime's authority from outside that
runtime's own process, and have the very next protected action fail as a
result, before it reached a target system.**

`AocKernel.evaluate`/`enforce`, `AocEnterpriseRuntime.evaluate`/`enforce`,
and `AocGuard.enforce()` are all real decision points, but every one of
them is called *by* the hosting process for a single request; none of them
represents standing, revocable, time-boxed authority a runtime holds
across many actions, and none of them is reachable by an external operator
independent of the runtime's own cooperation. `ExecutionGrant.expiresAt`
(`src/runtime/host.ts`) is the closest existing analog to a lease, but it
is issued and consumed entirely in-process. No Ed25519 (or any concrete)
signing implementation exists anywhere in the repository --
`RuntimeSignerPort` is an interface with no implementation. No
`CREATED -> RUNNING -> PAUSED -> ... -> TERMINATED` state machine existed
for a runtime instance as opposed to a request.

This ADR covers the vertical slice that closes that gap, scoped
deliberately small per the mission's own instruction: "Build the smallest
credible vertical slice that proves real external runtime authority,"
not the full future protocol/DAO/federation/certification system.

## Decision

### 1. Governed vs. ungoverned agent

An **ungoverned** agent is any process holding tools, credentials, or
access on its own authority. A **governed** agent is one whose effective
authority is externally issued, narrowly scoped, continuously valid,
independently revocable, enforced outside the agent, and auditable
(mission's central principle). `GovernedAgent`
(`src/enterprise/runtime-authority/contracts.ts`) is the authority-facing
identity record: `agentId`, `tenantId`, `status`
(`ACTIVE | SUSPENDED | REVOKED`), `ownerAuthorityId`, an optional
`publicKey`, and an optional `passportId` cross-reference.

`GovernedAgent` deliberately does **not** duplicate `AgentPassport`. The
Passport remains the canonical identity/provenance/lifecycle record for an
agent as an entity (6-state lifecycle, event-sourced, SHA-256 event
chain). `GovernedAgent` is a narrower, authority-facing projection the
Gateway can check on every single action without touching the Passport's
full event history, and it may reference a `passportId` rather than
re-deriving identity from scratch. This mirrors the repository's existing
discipline of keeping distinct concerns in distinct, cross-referencing
records (Passport / Evidence Bundle / Governance Record / Assurance
Assessment all follow this pattern already).

### 2. Runtime state machine

`GovernedRuntimeState` is exactly the mission's seven states with the
transition matrix in `contracts.ts`'s `GOVERNED_RUNTIME_TRANSITIONS`:

```
CREATED     -> AUTHORIZED
AUTHORIZED  -> RUNNING
RUNNING     -> PAUSED | ISOLATED | QUARANTINED | TERMINATED
PAUSED      -> RUNNING | ISOLATED | TERMINATED
ISOLATED    -> QUARANTINED | TERMINATED
QUARANTINED -> TERMINATED
TERMINATED  -> (none)
```

`TERMINATED` is irreversible by construction: the matrix has no outgoing
edges for it, and `state-machine.ts`'s `assertRuntimeTransition` is the
*only* place a transition is permitted, throwing
`RuntimeStateTransitionError` (mapped to
`RUNTIME_AUTHORITY_INVALID_STATE_TRANSITION`, HTTP 409) for anything else.
`RuntimeAuthorityService.terminate` is the only writer that can reach
`TERMINATED`, and no method exists anywhere that could resurrect a
terminated runtime -- a caller must call `createRuntime` again, which
mints a brand-new `runtimeId`.

Only `RUNNING` is in `GOVERNED_RUNTIME_ACTIONABLE_STATES`; the Gateway's
very first substantive check (after existence) is exactly this membership
test.

### 3. Authority Lease design

`AuthorityLeasePayload` matches the mission's field list exactly:
`leaseId, tenantId, runtimeId, agentId, capabilities, policyVersion,
issuedAt, expiresAt, nonce, keyId`. Leases default to a 30-second TTL
(`DEFAULT_LEASE_TTL_SECONDS`), issued by `RuntimeAuthorityService.issueLease`
only when: the runtime is `RUNNING` or `AUTHORIZED`, the agent is `ACTIVE`,
every requested capability has an active `RuntimeCapabilityGrant` on that
runtime, and none of the requested capabilities are in the unconditional
`PROHIBITED_CAPABILITIES` list. A lease can therefore never be minted
broader than what was already, separately, granted -- issuance is a
narrowing operation, never a source of new authority.

`renewLease` issues a brand-new lease (new `leaseId`, new `nonce`, new
expiry) and immediately marks the old one `SUPERSEDED` -- "never
reactivate a previously revoked lease" holds for superseded leases too,
by construction: `LeaseStore` has no un-revoke/un-supersede method.

Canonical serialization for signing reuses the Governance Store's own
`aoc.canonical-json.v1` (`canonicalSerialize`) rather than inventing a
second canonicalizer -- the same reuse discipline the Evidence Bundle and
Governance Store ADRs establish.

### 4. Signing and key separation

Leases are signed with **Ed25519** via Node's built-in `node:crypto`
(`generateKeyPairSync('ed25519')`, `crypto.sign`/`crypto.verify`) -- no
new dependency, and the first concrete signing implementation in this
repository (previously `RuntimeSignerPort` had zero implementations
anywhere). `RuntimeAuthoritySigner` (`crypto.ts`) is the only object that
ever touches a private key; `RuntimeAuthorityVerifier` is constructed from
public keys only (`createVerifierForSigners`), matching the mission's
explicit requirement that "the enforcement gateway should only need
verification material." The Gateway is *constructed with* a verifier, not
a signer -- there is no code path by which `gateway.ts` could reach a
private key even if a bug tried.

**Known limitation, explicitly**: in this single-process MVP, the signer
and the verifier are constructed from the same key inside one composition
root (`composition-root.ts`), because there is exactly one Enterprise Host
process. This satisfies "the agent runtime never holds the private key"
(the only requirement this vertical slice can fully prove), but does
**not** yet satisfy "the private key lives in an isolated
service/HSM/KMS separate from the enforcement path" -- that separation
requires a second deployable (a signer service) this slice does not
build. See "Known limitations" below.

`LeaseStore` persists the lease's `payload` (non-secret, needed to answer
membership/expiry/scope questions) and a `leaseDigest` (a `sha256:` digest
of the full signed lease) rather than a second copy of the raw signature
treated as a reusable credential -- mission section 3.4's "token hashes,
not raw sensitive tokens" requirement.

### 5. Enforcement Gateway boundary

`gateway.ts`'s `authorizeAction` is the **only** function in the package
that decides whether a protected action proceeds, implementing the
mission's 15 checks in the mission's own order (see the file's inline
numbering: runtime exists -> RUNNING -> agent active -> signature valid ->
unexpired -> unrevoked -> tenant/runtime/agent binding -> capability in
lease -> grant still active -> resource in scope -> policy -> replay ->
emergency deny). The first failing check wins; every check after it is
skipped. `RuntimeAuthorityService` has no method shaped like
`execute`/`invoke`/`run`/`call` (enforced by an adversarial test,
`adversarial.test.ts`, "the Gateway is the only execution path") -- there
is structurally no second door.

`PmfreakResourceServer` (the simulated Enterprise Resource,
`pmfreak/pmfreak-resource.ts`) independently re-verifies a claimed
`GatewayDecision` against the real evidence chain before ever performing a
side effect, rather than trusting a caller's assertion that the Gateway
said ALLOW. This is the concrete demonstration of mission section 2.6's
"no silent bypass": even a caller with in-process access to the resource
function cannot fabricate authorization, because the resource checks for a
real, hash-chain-verified `ACTION_AUTHORIZED` event, not just a
well-shaped object.

The Gateway never throws. Every code path -- including an unexpected
exception from a dependency -- resolves to a `GatewayDecision`, defaulting
to `DENY / AUTHORITY_SERVICE_UNAVAILABLE` (mission section 2.3, fail
closed; verified by an adversarial test that injects a throwing store).

### 6. Revocation semantics

`pause`/`isolate`/`quarantine`/`terminate` all call the same
`revokeAllActiveLeases` helper: every currently-`ACTIVE` lease for the
runtime is marked `REVOKED` **synchronously**, in the same call that
performs the state transition -- there is no window between "runtime state
changed" and "leases revoked" for a race to exploit (verified by the
adversarial "queued job executing after pause" and "concurrent action"
tests). `resume` requires a fresh `RuntimeControlRequest`, re-checks the
agent is still `ACTIVE`, and issues a **new** lease; it never reactivates
anything. `terminate` additionally revokes every active
`RuntimeCapabilityGrant` on the runtime, so even a lease minted moments
before termination (if one somehow survived, which the transition
ordering above prevents) would fail the Gateway's capability-grant check
independently.

Every control action requires `RuntimeControlRequest { reason,
requestedBy, severity, correlationId? }` and is idempotent by construction
(calling `pause` on an already-`PAUSED` runtime is a same-state transition
the matrix explicitly allows, and `revokeAllActiveLeases` is a no-op over
an empty active-lease set).

### 7. Evidence model

`RuntimeEvidenceEvent` matches the mission's field list. The hash chain
(`previousHash` + `eventHash = computeDigest({...event, previousHash})`)
reuses the Governance Store's own canonicalization and SHA-256 digest
primitives (`../governance-store/canonical-json.ts`, `digest.ts`) rather
than inventing a third canonicalizer in the repository (Governance Store,
Evidence Bundle, and now Runtime Authority all share one). Verification
recomputes every hash from stored content rather than trusting what is on
record (`verifyRuntimeEvidenceChain`, a pure function operating on any
event array, not just a log instance's own internal storage --
specifically so tests, and any future forensic tool, can prove tamper
detection against deletion/reordering/duplication, not only in-place field
mutation).

Sensitive-looking payload keys (`password`, `token`, `secret`, `apiKey`,
`authorization`, `signature`, `privateKey`) are redacted at append time,
defense-in-depth alongside "never put secrets in an evidence payload" as a
calling convention.

This is, explicitly, the same integrity model the Governance Store already
documents for itself: **an integrity mechanism, not a signature, and not
external anchoring.** It detects that stored bytes changed after commit;
it does not, on its own, prove who committed them, and it does not defend
against a privileged store administrator who rewrites an entire chain
self-consistently. See "Known limitations."

### 8. Fail-closed behavior

Fail-closed is enforced at three independent layers, not one:

1. The Gateway's own `try/catch` (any unexpected error -> `DENY
   AUTHORITY_SERVICE_UNAVAILABLE`, never a throw a caller could
   misinterpret as "undetermined, proceed anyway").
2. The Resource boundary (`PmfreakResourceServer`) refuses to act on
   anything but a `GatewayDecision` it can independently re-verify against
   the evidence chain -- absence of proof is treated as absence of
   authorization, never the reverse.
3. The runtime-state check runs *before* every other Gateway check, so an
   unknown/absent runtime (`RUNTIME_NOT_FOUND`) or non-`RUNNING` state
   denies before any lease/capability/policy logic even executes.

### 9. PMFreak integration

`src/enterprise/runtime-authority/pmfreak/` implements the mission's
Schedule Health Agent scenario end to end against real code (not mocks):
`scenario.ts` builds one fully-authorized runtime (agent registered,
runtime created/authorized/started, all four allowed capabilities
granted, first lease issued); `schedule-health-agent.ts` drives the
four-step analysis (`project.read`, `schedule.read`, `dependency.read`,
`recommendation.create`) entirely through `gateway.authorizeAction`;
`pmfreak-resource.ts` is the simulated Enterprise Resource described
above. The acceptance test
(`__tests__/pmfreak-vertical-slice.test.ts`) walks the mission's full
18-step flow and is the executable form of this ADR's claims.

This is a **simulated** PMFreak service, not the real PMFreak product --
the existing `src/features/aoc-integrations/pmfreak-remote-governance-endpoint`
handler is a different, pre-existing flow (a governance-request-intake
endpoint, deliberately left unmounted -- see its own code comments) and
was left untouched by this work; wiring AOC Runtime Authority to the real
PMFreak service over the network is future work, not simulated here.

### 10. Module composition

`src/enterprise/runtime-authority/` is a new, independent package
following the exact precedent of Passport/Evidence/Assurance: its own
in-memory stores (four: agents, runtimes, grants, leases) plus its own
evidence log, none persisted inside the Governance Store, registered as a
new optional `EnterpriseModule`
(`aoc.enterprise.runtime-authority`, `criticality` controlled by
`AOC_ENTERPRISE_RUNTIME_AUTHORITY_REQUIRED`, default `false` --
degrades gracefully, matching every other optional module's default) in
`composition-root.ts`, with zero declared dependencies on Passport or the
Governance Store (an agent can be governed with zero Passport records
present, mirroring the Passport module's own precedent for staged
rollout). Exposed over HTTP at `/api/runtime-authority/*` via the existing
`node-http-adapter.ts`, following that file's established
routing/validation/error-mapping conventions exactly (`*-contract.ts`
request validators, `EnterpriseHttpError` mapping, tenant-scoped access
context resolved from the `Authorization` header the same way every other
module resolves it).

## Consequences

Positive:

- A real, network-reachable Enforcement Gateway now exists
  (`POST /api/runtime-authority/runtimes/:id/gateway/authorize`), closing
  the concrete gap the pre-work audit found.
- Pause/isolate/quarantine/terminate are now real, externally-triggerable,
  evidence-producing state transitions with synchronous lease revocation.
- The first concrete Ed25519 signing implementation in the repository.
- 33 adversarial tests plus the full 18-step acceptance test give this
  vertical slice a much higher bar of proof than "it compiles" --
  denial is demonstrated from outside the calling agent's control flow in
  every case.

Negative / accepted for this vertical slice:

- Current-state stores (`GovernedAgentStore`, `GovernedRuntimeStore`,
  `CapabilityGrantStore`, `LeaseStore`) are plain in-memory maps, not
  event-sourced and not durable across a process restart -- unlike
  Passport/Governance Store/Assurance, which are all event-sourced with a
  SQLite provider. The tamper-evident evidence log is the durable,
  append-only source of truth for *what happened*; the stores are a fast
  current-state projection, not a second audit trail. A restart loses
  in-flight runtimes/leases/grants entirely.
- Signer and Gateway share a process (see "Signing and key separation"
  above) -- private-key isolation from the enforcement path is not yet
  achieved, only private-key isolation from the *agent*.
- Policy evaluation is a static allow-list
  (`PROHIBITED_CAPABILITIES`) plus a `policyVersion` string-equality check,
  not an integration with the repository's real policy engine
  (`domain-policy-pack-runtime`/`policy-pack-foundation`).
- `isolate` revokes leases and capability grants but cannot forcibly close
  an already-open outbound network connection -- there is no process
  supervision layer in this slice.

## Rejected alternatives

- **Build `GovernedAgent`/`GovernedRuntime` as event-sourced aggregates
  from day one, matching Passport exactly.** Rejected for this vertical
  slice on cost/schedule grounds -- the mission explicitly asks for the
  smallest credible slice, and the tamper-evident evidence chain already
  satisfies the audit requirement the event-sourcing would otherwise
  provide. Recorded as a "what should be built next" item, not silently
  dropped.
- **Reuse `src/features/action-enforcement`'s `AocGuard` as the
  Enforcement Gateway directly.** Rejected: `AocGuard` is a real,
  in-process, voluntarily-called library (the caller must choose to call
  `enforce()`); it has no runtime-state/lease concept and no external,
  independently-reachable control surface. Extending it to add those would
  have meant deep changes to a system with ~100 existing tests and a
  different design center (action policy, not runtime lifecycle
  authority). A new, narrow Gateway that can later *call into* the policy
  engine was judged lower-risk.
- **Extend `AgentPassport` with a `runtimeState` field instead of a
  separate `GovernedRuntime`.** Rejected: Passport identity/status is a
  slow-changing, human-reviewed lifecycle (`draft/active/suspended/
  revoked/expired/retired`); runtime authority state changes on the order
  of seconds (a 30-second lease) and must support many concurrent
  runtimes per agent. Conflating the two would have forced Passport's
  event-sourcing discipline onto a much higher-frequency write path, or
  weakened Passport's own invariants to accommodate it.
- **Blockchain-anchor the evidence chain in v1.** Rejected for the same
  reason the Governance Store ADR rejects it: external trust anchoring
  before the basics exist is decorative before it is useful; deferred.

## Known limitations (explicit, not hidden)

1. **Key separation is partial.** Signer and Gateway/verifier share one
   process. Production deployment requires a genuinely separate
   signer service (KMS/HSM-backed) exposing only `sign()`, with the
   Gateway holding public keys it fetches independently.
2. **No durable persistence for agents/runtimes/grants/leases.** A process
   restart loses all current state (the evidence log's design supports a
   durable store; the current-state stores do not yet have one). Adding a
   SQLite provider mirroring Passport's `sqlite-passport-store.ts` is the
   natural next step.
3. **Policy evaluation is a static allow-list, not a real policy engine
   integration.** `POLICY_DENIED` currently fires only for the fixed
   `PROHIBITED_CAPABILITIES` list and a `policyVersion` string mismatch --
   it does not consult `domain-policy-pack-runtime`.
4. **`isolate` cannot forcibly sever an already-open outbound
   connection.** It revokes leases/capabilities (so no *new* protected
   action succeeds), but process-level network isolation is out of scope
   for an in-process TypeScript library.
5. **No renewal scheduler.** `renewLease` exists and works, but nothing in
   this slice proactively renews a lease before it expires; a real agent
   runtime integration needs its own renewal loop that stops issuing
   protected actions if renewal fails (mission section 3.4's requirement
   is implemented as a callable primitive, not as automatic background
   behavior).
6. **PMFreak integration is simulated**, not wired to the real PMFreak
   product or its existing (deliberately unmounted)
   `pmfreak-remote-governance-endpoint` handler.
7. **The control dashboard has no authentication UI beyond a bearer-token
   field** -- it is explicitly documented in-page as *not* the enforcement
   mechanism; real access control is entirely server-side (the same
   `AOC_ENTERPRISE_REQUIRE_AUTH`/API-key mechanism every other Enterprise
   endpoint uses). It does not yet hide privileged controls from an
   unauthorized viewer client-side; a production dashboard would need a
   real session/role model to gate what renders, not just what succeeds.
8. **Some mission-listed adversarial vectors were not built as fake
   infrastructure just to test their absence** -- cached-credential reuse,
   a rogue child process, a background job queue, an async callback firing
   post-revocation, and a test-only endpoint left enabled in production
   all describe infrastructure this MVP does not have. Building any of
   them solely to demonstrate they can be "blocked" would prove nothing
   real; they are recorded here as gaps to close if/when that
   infrastructure is built, not claimed as tested.
