# ADR: Durable Kernel Authority belongs to Frontera

- **Status:** Accepted
- **Increment:** P0-PKG-07
- **Supersedes:** nothing. Additive to `createDefaultKernelProviders()`.
- **Companion guide:** [`AOC_DURABLE_KERNEL_AUTHORITY.md`](../enterprise/AOC_DURABLE_KERNEL_AUTHORITY.md)

## Context

Frontera already had a real decision engine. `AocKernel.evaluate()` composes
Recognition Runtime, Authority Graph, Approval Runtime and External Agent
Handshake through a `RecognitionProvider`, and its behaviour was measured
directly rather than assumed:

```text
unseeded actor                       -> denied (RECOGNITION_ACTOR_UNKNOWN)
seeded matching actor/scope/action   -> allowed (ACTION_ALLOWED)
wrong resource scope                 -> denied
wrong action                         -> denied
new provider instance, same IDs      -> denied
```

The last line is the problem. `createDefaultKernelProviders()` builds a real
but *empty*, process-local world backed by in-memory `Map`s. Every actor, trust
domain, passport, capability token, authority grant and delegation grant lived
in the memory of whichever process happened to seed it, and vanished with it.

So the deficiency was never the engine:

```text
FRONTERA_KERNEL_DECISION_ENGINE = REAL
FRONTERA_DURABLE_AUTHORITY_SOURCE = MISSING
FRONTERA_OPERATOR_PROVISIONING = MISSING
```

An external application facing this has only bad options: seed Frontera on
every request, become its own authority issuer, fabricate capability tokens, or
copy its own permissions across at evaluation time. Each collapses the
application into authority issuer, registry administrator, subject *and*
authorization requester simultaneously — which is not authorization at all.

## Decision

Frontera owns a durable, operator-provisioned **Kernel Authority Store**, and a
provisioning surface separate from the evaluation surface. The Kernel remains
the only component that decides.

### Why this belongs to Frontera, not to a consuming application

An authority source that lives in the application's database is one the
application can edit. If PMFreak — or any consumer — held the actors, tokens
and grants, then "may this agent act?" would be answered out of a table the
asking party controls. The answer would be a restatement of the question.

The separation is not stylistic. It is what makes the decision independent:
the application asks, and something it cannot write answers.

### Why evaluation history is not an authority source

The Governance Store is the durable record of evaluations that already
happened. Reusing it here was considered and rejected: its contract is
append-a-completed-evaluation, and it is queried by request/evaluation id, not
by "what authority stands right now". Deriving current authority from a log of
past decisions requires re-deciding, which is precisely the thing this layer
must not do.

The repository already has this precedent — Governance Store, Passport Store,
Assurance Store are independent domains in independent stores, each with its
own schema version and its own file. Kernel Authority follows it: a separate
store, a separate configured path, a separate schema identifier. SQLite being
already available is not a reason to put authority records in evaluation
tables.

### Why this is not the Governed Authority Store

`src/enterprise/authority-governance/` already contains something called an
authority store, and it is genuinely a different model — same word, different
question:

| | Governed Authority Store | Kernel Authority Store |
| --- | --- | --- |
| Question | Does this holder control this much of this **right** of this resource? | Is this actor **recognized**, and does an authority chain permit this action on this scope? |
| Vocabulary | `GovernedRightType`, `GovernedRightsScope`, fractional positions, encumbrances, reservations | Actors, trust domains, passports, capability tokens, authority grants, delegations |
| Kernel role | Optional `GovernedAuthorityProvider` port; narrows an already-viable outcome | The required `RecognitionProvider`'s world; without it nothing is recognized at all |
| Failure mode | "You hold 40% and are moving 60%" | "You are not recognized in this trust domain" |

They were not merged. A same-name heuristic is not evidence of a shared model,
and folding them would force one store to carry two vocabularies whose failures
are disjoint. A deployment can adopt either, both, or neither.

## State inventory

Every mutable state family reachable from `createDefaultKernelProviders()` was
traced through `KernelWorldHandles` to `AocKernel.evaluate()` and classified by
executing the engine, not by reading types.

| State family | Current implementation | Affects allow/deny? | Survives restart (before)? | Operator-owned? | Persisted now? |
| --- | --- | ---: | ---: | ---: | ---: |
| `ActorRegistry` | in-memory `Map` | **Yes** — absence is `ACTOR_NOT_FOUND` | No | Yes | **Yes** |
| `TrustDomainService` | in-memory `Map` | **Yes** — `ROGUE_ACTOR_NO_TRUST_DOMAIN`, issuer/type acceptance | No | Yes | **Yes** |
| `PassportService` | in-memory `Map` | **Yes** — `PASSPORT_REQUIRED` / `PASSPORT_NOT_FOUND` | No | Yes | **Yes** |
| `CapabilityTokenService` | in-memory `Map` | **Yes** — action grant, resource scope, prohibitions, expiry | No | Yes | **Yes** |
| `AuthorityGraphStore` root issuers | in-memory `Map`/`Set` | **Yes** — an issuer that is not root cannot originate a grant | No | Yes | **Yes** |
| `AuthorityGraphStore` grants | in-memory `Map` | **Yes** — required for agent actors and acting-for-principal | No | Yes | **Yes** |
| `AuthorityGraphStore` delegations | in-memory `Map` | **Yes** — the agent's own chain link | No | Yes | **Yes** |
| Revocation status (actor/passport/token/grant/delegation) | status field on the above | **Yes** — `REVOKED`, `ANCESTOR_*_REVOKED` | No | Yes | **Yes** (as terminal events) |
| `AuthorityGraphStore` cross-domain acceptance | in-memory `Set` | Yes, but **closed by default** | No | Yes | **No** — see below |
| `EvidenceLedger` | in-memory append list | No — records decisions, never changes them | No | No | **No** (audit-only) |
| `AuthorityLineageLedger` | in-memory append list | No | No | No | **No** (audit-only) |
| `AuthorityProofService` | in-memory `Map` | No — proofs describe decisions already made | No | No | **No** (audit-only) |
| `PolicyEvaluator` / `RecognitionVerifier` / resolvers / verifiers | stateless | n/a | n/a | n/a | **No** (no state) |
| `ApprovalRuntime` | in-memory | Contextual — only for actions whose token requires approval | No | Partly | **No** — see below |
| `ExternalAgentHandshakeRuntime` | in-memory | Contextual — only for `external` actors | No | Partly | **No** — see below |

**Deliberately not persisted, and why.** Persisting everything reachable would
be as wrong as persisting too little.

- *Audit/evidence ledgers* record what was decided; they never change what
  gets decided. Replaying them at startup would manufacture history that never
  happened. The durable audit trail that matters here — who provisioned what
  authority, when, superseding which state — is the authority store's own event
  log.
- *Approval and handshake runtimes* carry live, in-flight interaction state
  (a pending approval, an active visa). They are contextual, not
  source-of-truth, and both are already closed by default: an unapproved action
  requiring approval denies, and an `external` actor without a valid visa
  denies. Nothing about restarting them widens authority. Persisting them is a
  legitimate future increment; claiming it here without the engine work would
  be persistence theatre.
- *Cross-domain acceptance* is an opt-in that only ever widens. It is closed by
  default and stays closed across restart, which is the safe direction. Adding
  a durable way to open it was out of scope for an increment whose purpose is
  to make authority survive, not to make it easier to grant.

## How the invariants hold

**`AocKernel` still decides.** The store returns records. Hydration replays
them through the engines' *own* registration APIs — the same ones the engines'
fixtures use — into unmodified `AocRecognitionRuntime` and
`AuthorityGraphRuntime` instances. The 10-policy recognition chain and the
authority chain verifier are untouched. No decision semantics moved into the
persistence layer; there is no error code in `KernelAuthorityErrorCode` that
means "denied".

**Provisioning is separated from evaluation.** Writes require
`context.system === true` *and* a named operator, enforced inside the store
rather than in the service, so the guarantee holds even for a caller that
bypasses the service. The provider set handed to the evaluation path holds a
read context and no write surface at all. An evaluation request is a question
about facts; it has no representation in which it could be a command.

**Restart restoration.** `createDurableKernelProviders()` reads the
organization's records and replays them in two passes — every entity as
provisioned, then every revocation applied. The two passes mirror the event log
and avoid an ordering hazard: a delegation whose source grant is now revoked
cannot be replayed at all in one pass, and dropping it would lose the record
rather than deny through it.

**Revocation survives.** Revocation is an appended terminal event, so it is
part of the durable chain rather than a mutation that a rebuild could miss.
Re-provisioning a revoked id is refused, so no retry ordering resurrects it.

**Hydration is a projection, never a second source of truth.** After every
committed write the world is rebuilt *from the store* rather than patched in
place, so the two cannot diverge through a partially-applied mutation. A record
the engine refuses to replay fails startup rather than being skipped: a world
missing records is not a narrower world, it is an unknown one.

**Public consumers.** Everything ships on the existing
`@aoc-enterprise/runtime/enterprise` subpath — no new subpath, no deep imports,
no test fixtures on the consumer's path. `npm run check:clean-room-consumer`
installs the packed tarball into a throwaway project and drives the whole
lifecycle across separate OS processes.

## Alternatives considered

**Per-request world construction.** Load only the records a request touches and
build a throwaway world each time. Attractive: no staleness, no reload. Rejected
because it makes the exposed `KernelWorldHandles` meaningless and turns every
evaluation into a store read, and because the honest handles a hydrated world
provides are what let health, portability and the audit trail describe the
world that actually decides.

**Long-lived world mutated in place by the provisioning service.** Rejected: a
store write that succeeds followed by a runtime mutation that throws leaves the
two divergent, with the world claiming authority the durable source never
accepted. Rebuilding from the store makes divergence structurally impossible.

**Org-qualified ids in one shared world.** Rejected: it would require rewriting
request actor ids on the way in, and a request whose organization is absent
would have no well-defined world. One provider set per organization is simpler
and makes cross-organization leakage impossible by construction.

**Reusing the Governance Store.** Rejected — see above.

**Minting Protocol capability tokens.** Explicitly not done. `AocKernel` does
not consume Protocol's `AuthorizationGrantInput`, so nothing here required a
Protocol change, a widened Protocol export, or a new Protocol capability. The
Recognition Runtime's own `RecognitionCapabilityToken` is used where the
engine's real path requires one, and it is not conflated with Protocol's
`CapabilityToken`, an application's capability claim, or a workspace role.

## Consequences

**Additive.** `createDefaultKernelProviders()` behaves exactly as before, all
existing reason codes and serialized shapes are unchanged, and a deployment
that sets nothing new observes no behavioural difference. The capability is
opt-in.

**A fourth durable store.** Operators now back up four SQLite files instead of
three. This is a real operational cost and the correct one: the alternative is
an authority world that disappears during disaster recovery.

**Single-writer in v1.** A world hydrated in one process does not observe
another process's writes until `reload()` or a restart. Documented explicitly
rather than left to be discovered.

**Trust domains and root issuers are not revocable.** Retiring a boundary means
revoking the authority inside it. This is a deliberate narrowing: revoking the
boundary itself would leave its credentials replayed as live, which widens what
the remaining state appears to mean.

---

## Corrections (post-merge review)

The first implementation of this ADR shipped in `1.1.0` with ten defects that a
review surfaced after merge. Six were reproduced against the merged code before
any fix was written. They are recorded here rather than quietly repaired,
because four of them contradicted guarantees this document asserts, and a
reader deserves to know which claims were once wrong.

| Claim in this ADR | What the code actually did | Fixed in `1.2.0` by |
| --- | --- | --- |
| Digest-chained, tamper-evident | Verified only that each event *cited* the previous stored digest; never recomputed a digest from the event's own fields. Editing a capability token's `actions` in place, leaving digest columns untouched, hydrated as authority. | `computeKernelAuthorityEventDigest`, recomputed and compared for every event on every read |
| "A dropped revocation event would resurrect authority" — presented as prevented | Prevented for an event lost from the *middle* of a chain. An event lost from the *end* left a perfectly self-consistent prefix, so the entity read back as `active`. | Cross-checking the reconstructed head against the independently recorded `latest_sequence`/`latest_event_digest` |
| The provider set carries no write surface | It extended `KernelProviderSet`, which exposes the concrete mutable Recognition and Authority runtimes — `registerActor`, `issueCapabilityToken`, `issueAuthorityGrant`. An application could mint credentials in the live world and be allowed. | Splitting `DurableKernelDecisionService` (public, read-only) from `createDurableKernelWorld` (internal, keeps the handles private to the composition root) |
| Cross-organization isolation | Only an explicit *mismatch* denied. An omitted organization was treated as an implicit match, which also bypassed organization-scoped API-key authorization; a caller could alternatively inject the id through free-form `context`. | Requiring the organization explicitly, and stripping the reserved `organizationId`/`organizationName` keys from the free-form context bag in the Kernel's request adapter |
| Durable world survives restart | A grant whose id sorted before its parent's committed successfully and then failed *every* subsequent hydration — permanently bricking the world through a legitimate operator action. | Dependency-aware topological ordering within each entity kind, failing closed on a cycle |
| Additive, no behavioural difference | `backup:v1` began demanding `kernel-authority.sqlite` from every SQLite deployment, including those with the feature disabled, breaking existing backup automation. | Gating the store definition on `kernelAuthority.enabled` |

Four further defects were fixed in the same pass: an expired credential that
sorted first could shadow a valid one (expiry is now checked against the
payload, not the record's revoked/not-revoked status); an idempotency key
supplied on a replayed provision was never claimed and could later be spent on
a different entity; `AOC_ENTERPRISE_KERNEL_AUTHORITY_REQUIRED=false` was inert
because the store was opened before the lifecycle controller ever saw the
criticality; and the durable contract could not express the engine's
`evidenceRequirements` or `approvalRequirement`, so an approval-gated token
could not be persisted at all.

Two things are worth drawing out, because they generalise past these ten bugs.

**A digest chain that is never recomputed is decorative.** The original code
had every structural element of tamper evidence — canonical serialization, a
sha256 digest per event, a `previousEventDigest` link — and verified the one
property that does not require the payload to be honest. The lesson is not
"add a check"; it is that an integrity mechanism has to be tested by *tampering*,
not by reading the code and agreeing with it.

**Ordering by a name is not ordering by a dependency.** Entity ids sort
lexically; authority chains do not. The original ordering worked for every
world the test fixtures built, which is precisely why it survived to merge.
