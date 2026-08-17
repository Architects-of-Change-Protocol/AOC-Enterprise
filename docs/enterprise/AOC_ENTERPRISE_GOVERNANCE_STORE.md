# AOC Enterprise Governance Store v1

The Governance Store is the canonical, durable, append-oriented,
integrity-verifiable record of every governance evaluation the AOC
Enterprise Host performs. It was established by PR-004, evolving the
minimal PR-002 decision persistence.

**Core principle: the Governance Store does not decide. It records.**
The Kernel (`src/kernel/`) remains the sole source of governance decision
semantics; the Enterprise Host remains the orchestration boundary; the
Store preserves what happened in a form suitable for later verification.

- Code: `src/enterprise/governance-store/`
- Record model: `docs/enterprise/AOC_GOVERNANCE_RECORD_MODEL.md`
- Operations: `docs/enterprise/AOC_GOVERNANCE_STORE_OPERATIONS.md`
- Migration from PR-002: `docs/enterprise/GOVERNANCE_STORE_MIGRATION_V1.md`
- Decision record: `docs/architecture/ADR-ENTERPRISE-GOVERNANCE-STORE.md`

## Architecture

```
Governance Request
        │
        ▼
AOC Enterprise Host ── authentication, validation, idempotency resolution
        │
        ▼
AOC Kernel ── kernel.evaluate() (unchanged by PR-004)
        │
        ▼
Governance Store append transaction (atomic)
        ├── governance_requests          (request record)
        ├── governance_evaluations       (evaluation record, full sanitized result)
        ├── governance_trace_steps       (normalized trace)
        ├── governance_reason_codes      (normalized, queryable reasons)
        ├── governance_events            (embedded evaluation events)
        ├── governance_record_metadata   (version + lifecycle context)
        ├── governance_integrity         (digests + chain position)
        └── governance_idempotency       (tenant-scoped key claims)
        │
        ▼
Post-commit event publication (GovernanceEvaluationCompleted*, GovernanceRecordCommitted)
        │
        ▼
HTTP response (existing contract + optional `governanceRecord` block)
```

Five conceptual layers, one package (`src/enterprise/governance-store/`):

| Layer | Where |
|---|---|
| Write model | `GovernanceStore.appendEvaluation`, `appendReference`, `appendLifecycleEvent` |
| Integrity | `canonical-json.ts`, `digest.ts`, `projection.ts`, `verification.ts` |
| Query model | `GovernanceStore.query` + `getByEvaluationId/DecisionId/RequestId` |
| Reconstruction | `GovernanceStore.reconstruct` (structured `complete/incomplete/corrupted`) |
| Extension references | `GovernanceStore.appendReference` (`governance_references`) |

Two providers implement the same interface with the same semantics,
enforced by a shared contract test suite
(`src/enterprise/__tests__/governance-store-contract.test.ts`):

- `createInMemoryGovernanceStore()` — tests/local use;
- `createSqliteGovernanceStore(path, options?)` — the durable reference
  implementation (`better-sqlite3`, hand-written SQL, no ORM).

Both call the same pure aggregate builder (`buildGovernanceAggregate` in
`projection.ts`) and the same pure verifier
(`verifyGovernanceRecordIntegrity` in `verification.ts`), so projection,
redaction, limits, digests, and verification cannot drift between
providers.

## Append semantics (logical immutability)

The Store is **append-oriented**. Allowed: appending aggregates,
references, lifecycle events, and (future) correction/supersession
records. Forbidden and not implemented: updating or deleting any committed
record. There is no public update or delete method, and architecture tests
assert none appears.

Honesty about limits: SQLite itself cannot make rows immutable. Logical
immutability is enforced through API design (no mutating methods),
uniqueness/foreign-key constraints, deep-freezing of in-memory records,
and tests — and post-commit modification is *detectable* via digests
(below), not *preventable* against a privileged writer.

### The aggregate transaction

One evaluation = one atomic unit: request + evaluation + trace steps +
reason codes + evaluation events + metadata + integrity (+ idempotency
claim). `better-sqlite3` transactions commit all rows or none; the
in-memory provider commits in a synchronous section with no awaits. A
failed insert rolls back everything — tests prove no orphan rows survive.

### Event timing (Option A, mission section 65)

- `GovernanceEvaluationRequested` is published in-process *before*
  evaluation as an operational signal; its **durable** copy is embedded in
  the aggregate and committed atomically with the evaluation.
- `GovernanceEvaluationCompleted/Denied/ApprovalRequired/Failed` and
  `GovernanceRecordCommitted` are published only **after** the transaction
  commits.
- On commit failure, `GovernanceRecordCommitFailed` is published
  best-effort and the caller receives an infrastructure failure.
- No outbox table exists in v1: the durable event records inside the
  aggregate are the source of truth; in-process publication is best-effort
  by design. If reliable external delivery becomes a stated guarantee, a
  minimal outbox is the documented next step.

### Persistence invariant

**No successful governance response is returned when the required
Governance Store commit fails.** The Kernel result may exist transiently,
but Enterprise maps a failed commit to `503 GOVERNANCE_STORE_UNAVAILABLE`
or `500 GOVERNANCE_STORE_TRANSACTION_FAILED` and never claims governed
completion it cannot durably prove.

## Idempotency

First-class, tenant-scoped, enforced by database uniqueness constraints
(never only by in-memory locks):

- **Keys.** The caller-supplied `Idempotency-Key` HTTP header (preferred),
  plus `requestId` uniqueness as the always-on baseline (PR-002
  compatible). The Kernel request's own `idempotencyKey` field remains
  *engine* duplicate-suppression and is deliberately not reused.
- **Scope.** `org:<organizationId>` from the request's organization
  context, or the explicit `global` scope for unscoped requests. One
  tenant's key can never collide with another's
  (`UNIQUE(scope, idempotency_key)`).
- **Same key + same normalized request** → the previously stored result is
  returned (`idempotentReplay: true`), rebuilt from the stored aggregate —
  the Kernel is **not** re-run (resolution happens before evaluation via
  `resolveIdempotency`, verified by test).
- **Same key + different normalized request** → `409
  GOVERNANCE_IDEMPOTENCY_CONFLICT`. Same-`requestId`-different-payload
  keeps the PR-002 wire contract: `409 CONCURRENCY_CONFLICT`.
- **Concurrency.** A concurrent burst commits exactly one aggregate;
  equivalent racers receive the stored original; conflicting racers get
  409; no duplicates, no orphans (contract + integration tests).
- "Same normalized request" means: equal SHA-256 digest of the sanitized
  persistence projection of the normalized `KernelEvaluationRequest`.

## Integrity model and its limits

- **Canonical serialization** — `aoc.canonical-json.v1`
  (`canonical-json.ts`): sorted object keys, preserved array order,
  omitted `undefined` properties, ISO dates, `-0` normalization, UTF-8,
  rejection (not silent dropping) of unsupported values, no input
  mutation.
- **Digests** — SHA-256 over canonical serialization, formatted
  `sha256:<hex>` (`digest.ts`). No custom cryptography.
- **What each digest covers** is defined once, in `projection.ts`
  (`*DigestInput` functions), and reused verbatim by verification:
  - `payloadDigest` / `resultDigest`: the sanitized request/result payload;
  - `requestDigest` / `evaluationDigest`: the complete stored record
    including its payload digest column;
  - per-step `traceDigest` and per-event `eventDigest`: the record minus
    its own digest field; set-level `traceDigest`/`eventsDigest`: the
    ordered arrays of complete records;
  - `metadataDigest`: the complete metadata record;
  - `aggregateDigest`: the canonical object
    `{requestDigest, evaluationDigest, traceDigest, eventsDigest,
    metadataDigest, previousAggregateDigest?}` — never string
    concatenation.
- **Hash chain** — store-scoped: each aggregate records
  `previousAggregateDigest` (the previous aggregate's digest) and a
  monotonic `chainPosition`. Store-scoped is safe here because both
  providers serialize append transactions (better-sqlite3 is synchronous;
  SQLite allows one writer); no cross-node coordination is claimed. The
  chain also provides the stable pagination order.
- **Verification** — `verify()` recomputes every digest from the stored
  payloads and validates chain linkage; stored digest values are never
  trusted without recomputation. Result: per-check booleans plus
  structured failures.

**What this is NOT:** not a digital signature, not non-repudiation, not
blockchain anchoring, not an external timestamp authority, and not
protection against a database administrator who can rewrite records *and*
digests *and* the chain consistently. It makes tampering detectable under
the assumption that the verifier's code and the attacker's write access
don't fully overlap; external anchoring is a future layer.

## Reconstruction (not "replay")

Terminology is deliberate (mission section 29):

- **Reconstruction** — `reconstruct()` / `getBy*()`: read the stored
  historical record. Implemented.
- **Verification** — `verify()`: recompute digests, validate linkage.
  Implemented.
- **Decision re-evaluation / action replay** — NOT implemented. The Store
  never re-runs the Kernel and never re-executes external actions.

`reconstruct()` returns a structured `GovernanceRecordLoadResult`:
`complete` (with the full `GovernanceRecord`), `incomplete` (missing
components named), or `corrupted` (invalid JSON, unsupported schema
version — failures named). Partial data is never silently returned as
complete. `toKernelEvaluationResult(record)` rehydrates the sanitized
`KernelEvaluationResult` shape (result payload + normalized trace) —
this powers idempotent replays. `toGovernanceReplayMetadata(record)`
derives the replay-preparation metadata (contracts + versions) from what
was actually persisted; deterministic re-evaluation is *not* claimed,
because provider worlds and policy versions are not yet fully versioned
and recoverable.

## Query API

Bounded filters (`GovernanceStoreQuery`), ANDed: `requestId`,
`evaluationId`, `decisionId`, `correlationId`, `organizationId`,
`actorId`, `actionType`, `status`, `reasonCode`, and an inclusive
`from`/`to` range over `evaluatedAt`. Never raw SQL.

Pagination: cursor-based, ordered `chainPosition DESC` (newest committed
first — documented, stable under concurrent appends because chain
positions are immutable). The cursor is opaque (base64url) and validated;
`limit` defaults to 50, max 200. Results are summaries
(`GovernanceRecordSummary`); reconstruction is a separate call.

## Multi-tenant isolation

Every read/query takes a `GovernanceStoreAccessContext`
(`{organizationId?, actorId?, system}`), resolved by Enterprise — the
Store enforces scope, it never authenticates:

- non-system callers **must** present an organization scope
  (`GOVERNANCE_TENANT_SCOPE_REQUIRED` otherwise) and see only their own
  organization's records; a foreign record reads as `null`/404, never as
  an existence leak;
- a non-system caller filtering for another organization gets
  `GOVERNANCE_ACCESS_SCOPE_VIOLATION`;
- records without an organization are system-level and visible only to
  system callers;
- idempotency scope always includes the tenant;
- organization scope for HTTP reads derives from the authenticated API
  key (`governance-read-service.ts`), never from untrusted payload fields.

## Sensitive data and redaction

The Store persists an intentional **projection**
(`projectRequestPayload`/`projectResultPayload`), never raw HTTP input.
Deterministic redaction (`redaction.ts`) runs before persistence, before
digesting, and the structured logger's closed field set keeps payloads
out of logs entirely. Digests therefore attest to the sanitized persisted
record, not to undisclosed raw secrets — documented choice.

Rule: keys are split into words on camelCase/snake_case/kebab-case
boundaries and redacted when they contain a sensitive term
(`authorization`, `token`, `api key`, `secret`, `password`, `passphrase`,
`private key`, `cookie`, `session`, `credential`, `bearer`) — except keys
whose final word is `id`/`ids`, which are references to governed objects
(`capabilityTokenId`, `approvalProofId`) and are kept. The `Authorization`
header never reaches the Store at all (it stops at authentication).

## Size limits (enforced)

Configured via `EnterpriseConfiguration.persistence.limits`, validated at
startup, enforced on every append:

| Limit | Default | Error |
|---|---|---|
| `maxRequestPayloadBytes` | 256 KiB | `GOVERNANCE_RECORD_TOO_LARGE` (HTTP 413) |
| `maxResultPayloadBytes` | 512 KiB | `GOVERNANCE_RECORD_TOO_LARGE` (413) |
| `maxEventPayloadBytes` | 64 KiB | `GOVERNANCE_EVENT_PAYLOAD_TOO_LARGE` (413) |
| `maxTraceSteps` | 500 | `GOVERNANCE_TRACE_LIMIT_EXCEEDED` (413) |

## Error taxonomy and HTTP mapping

`GovernanceStoreError` codes (`errors.ts`) and their wire mapping
(`mapGovernanceStoreErrorToHttp`):

| Store code | HTTP |
|---|---|
| `GOVERNANCE_IDEMPOTENCY_CONFLICT` | 409 |
| `GOVERNANCE_STORE_UNAVAILABLE` | 503 |
| `GOVERNANCE_STORE_TRANSACTION_FAILED` | 500 |
| `GOVERNANCE_STORE_VALIDATION_ERROR` | 500 (internal) / 400 (caller input, e.g. bad cursor) |
| `GOVERNANCE_RECORD_NOT_FOUND` | 404 |
| `GOVERNANCE_RECORD_CORRUPTED`, `GOVERNANCE_INTEGRITY_VERIFICATION_FAILED` | 500 |
| `GOVERNANCE_RECORD_TOO_LARGE`, `GOVERNANCE_TRACE_LIMIT_EXCEEDED`, `GOVERNANCE_EVENT_PAYLOAD_TOO_LARGE` | 413 |
| `GOVERNANCE_TENANT_SCOPE_REQUIRED`, `GOVERNANCE_ACCESS_SCOPE_VIOLATION` | 403 |
| `GOVERNANCE_SCHEMA_VERSION_UNSUPPORTED` | 500 |

Kernel denials remain what they were: successful evaluations with a
`denied` status (HTTP 422), never Store errors. Raw database errors never
reach the wire.

## HTTP surface

- `POST /api/governance/evaluate` — unchanged contract; now accepts an
  `Idempotency-Key` header and adds an optional, backward-compatible
  `governanceRecord: { evaluationId, aggregateDigest }` response block.
- `GET /api/governance/evaluations/:evaluationId`
- `GET /api/governance/evaluations/:evaluationId/verify`
- `GET /api/governance/decisions/:decisionId`
- `GET /api/governance/requests/:requestId`

Read endpoints resolve scope from the authenticated API key
(org-scoped key → that organization; unscoped key → system; auth
disabled → system, the same local-dev trust posture the evaluate endpoint
already has). Handlers route only; all scoping lives in
`governance-read-service.ts`. No broad query endpoint is exposed over
HTTP in v1 — `GovernanceStore.query` is service-layer.

## Module and readiness

The PR-003 Persistence module evolved into the **Governance Store module**
(`aoc.enterprise.governance-store`, `modules/governance-store-module.ts`).
It is `required`: initialization verifies connectivity **and
writability** (a read-only store must not report evaluation readiness),
health surfaces `{writable, readable, schemaVersion, migrationState}`
into `/health`'s module block, and shutdown closes the store in reverse
dependency order. `PERSISTENCE_MODULE_ID` remains exported as a
deprecated alias of the new id.

## Versioning

- `AOC_GOVERNANCE_STORE_VERSION = '1.0.0'`
- Schema: `aoc.governance-store.schema.v1` (recorded in
  `governance_store_versions` and stamped on every aggregate's metadata;
  deliberately decoupled from the Enterprise package version)
- Contracts: `aoc.governance-store.v1`,
  `aoc.governance-request-record.v1`, `aoc.governance-evaluation-record.v1`,
  `aoc.governance-trace-record.v1`, `aoc.governance-event-record.v1`,
  `aoc.governance-integrity-record.v1`, `aoc.governance-reference-record.v1`
- Canonicalization: `aoc.canonical-json.v1`

## Telemetry and logging

Counters (via `EnterpriseTelemetry`): store appends (+failures,
+duration), idempotent replays, idempotency conflicts, queries
(+duration), integrity verifications (+failures), corrupted records.
Migration counters were deliberately **not** added: migration runs once at
store construction, before telemetry exists in the composition; migration
state is exposed through health instead of a counter that could never be
observed.

Log lines carry ids and outcomes only (request/decision/evaluation ids,
organization-safe fields, duration, created-vs-replay, error codes) —
never payloads, never raw context.

## Migration

See `docs/enterprise/GOVERNANCE_STORE_MIGRATION_V1.md`. Summary: v1
tables are created alongside the untouched PR-002 tables; legacy rows are
copied into marked (`migrationSource: "pr-002-governance-store"`),
integrity-sealed v1 aggregates; the migration is transactional,
idempotent, and non-destructive.

## Known limitations (v1)

Governance Store v1 does **not** provide: cryptographic signatures; an
external timestamp authority; blockchain anchoring; protection against a
privileged database administrator; distributed consensus; multi-region
replication; a PostgreSQL production architecture; event-sourcing
reconstruction of the whole platform; action replay; full deterministic
re-evaluation; Passport Runtime; Evidence Bundles or Evidence Runtime;
Assurance certification; a legal retention engine, legal hold, or privacy
deletion workflows (retention/deletion governance is explicitly
unresolved — permanent retention is *not* claimed as constitutionally
correct); automated corruption repair (corruption is reported, never
auto-repaired; future strategy: quarantine → appended correction →
Assurance review); multi-node hash-chain coordination; a public analytics
API; an administrative UI.

## Reference vocabulary

`GovernanceReferenceRecord.referenceType` classifies *what kind of thing* a
committed evaluation points at. The canonical list is
`GOVERNANCE_REFERENCE_TYPES` in
`src/enterprise/governance-store/contracts.ts`; the TypeScript union is
derived from it, so the type and the value that reaches storage cannot drift
apart.

| Reference type | Produced by | Means |
| --- | --- | --- |
| `passport_event` | AOC Enterprise | an Agent Passport lifecycle event |
| `evidence_bundle` | AOC Enterprise | an Evidence Bundle built over this evaluation |
| `assurance_record` | AOC Enterprise | an Assurance assessment or finding artifact |
| `authorization_artifact` | **AOC Enterprise** | **a durable artifact produced by AOC Enterprise that records or embodies authorization resulting from a governed enforcement decision** |
| `execution_record` | external system | a report that an external system acted on an authorization AOC issued |
| `external_artifact` | outside AOC | an artifact originating *outside* the AOC authorization machinery, referenced as evidence or context |

### `authorization_artifact` vs `external_artifact`

The distinction the vocabulary exists to make is **what AOC authorized**
versus **what an external system later did about it**:

- `authorization_artifact` — AOC-owned durable authorization artifact
  resulting from enforcement.
- `external_artifact` — artifact originating outside the AOC authorization
  machinery.

```
TokenizationMandate               -> authorization_artifact
CollateralizationMandate          -> authorization_artifact
external token issuance record    -> execution_record / external_artifact
external collateral filing        -> execution_record / external_artifact
```

In this repository both governed actions record the external side as
`execution_record`, the more specific canonical type, and reserve
`external_artifact` for artifacts that are neither AOC authorizations nor
reports of execution against one. Collapsing the two categories would make
the record unable to answer the one question an auditor most needs answered.

### Authorization artifact trust boundary

**A reference type is evidence classification. It is never authority.**

Nothing in the runtime reads `referenceType` to decide anything, and
appending one grants nothing. Authority continues to come only from the
Kernel decision, the Authority Graph, Recognition Runtime, Approval Runtime,
policy, and the canonical mandate issuance path. The invariant both governed
actions satisfy is directional and cannot be run backwards:

```
governance decision persisted -> allowed result -> mandate issued
  -> mandate persisted -> reference appended
```

An `authorization_artifact` reference appended by hand names a mandate that
does not exist; no enforcement path consults it, so it confers nothing. This
is covered by tests in
`src/enterprise/__tests__/governance-authorization-artifact.test.ts` and by a
"classification, not authority" test in each action's suite.

### Reference vocabulary compatibility

`reference_type` is persisted as free `TEXT` with no `CHECK` constraint.
Validation is therefore deliberately **asymmetric**:

- **Write** — `assertCanonicalReferenceType` (`store-common.ts`) rejects any
  value outside `GOVERNANCE_REFERENCE_TYPES` with
  `GOVERNANCE_STORE_VALIDATION_ERROR`. Both providers call it, so an
  arbitrary string can never be stored and later cast back out as though it
  were a classification this build recognizes — which matters most for
  `authorization_artifact`, the one value that reads as "AOC authorized this".
- **Read** — deliberately permissive. Reads never reject a stored value, so
  history written before a vocabulary addition, and rows written by a newer
  runtime, stay readable instead of turning an intact aggregate into a
  corruption error.

**Does `referenceType` require version-aware interpretation? No.** The
existing storage contract is forward-compatible for an added value, on the
evidence: the column is unconstrained `TEXT`; both schema-version guards
(`governance_store_versions.schema_version` at open,
`governance_record_metadata.schema_version` at load) are unaffected by the
vocabulary; and no code path branches on `referenceType`. Adding
`authorization_artifact` therefore required **no schema migration and no
version bump**. Bumping either version would have been actively harmful — it
would make older runtimes *refuse to open* databases they can read perfectly
well.

Concretely, an older runtime reading a record written by this build **accepts
the value verbatim**: it opens the store, loads the aggregate, keeps the
reference, and returns the exact stored string. It does not reject, fail
closed, drop the row, or misclassify it as another member. Its one real
defect is that its declared union no longer describes every value it can
return — harmless here because nothing branches on the field, and the reason
a consumer's exhaustive `switch` needs a `default`. This is demonstrated
against the frozen read path in `governance-authorization-artifact.test.ts`
rather than asserted.

### Historical classification

Mandates recorded before `authorization_artifact` existed were stored as
`external_artifact`, which was the only value those runtimes could write.
**Those rows are left unchanged.** No migration rewrites them.

```
historical classification   TokenizationMandate/CollateralizationMandate -> external_artifact
new canonical classification TokenizationMandate/CollateralizationMandate -> authorization_artifact
```

This follows the Store's append-only model: there is no update path for a
reference row, `GovernanceCorrectionRecord` is reserved with no v1 API, and
rewriting past evidence to improve its taxonomy would replace historical
truth with a present-day opinion. A reader distinguishing the two eras should
use the record's `createdAt` and the evaluation's `enterpriseVersion`, not
assume classification has always meant the same thing.

**Limit worth naming:** reference rows are appended *after* the aggregate
digest is computed (`projection.ts` builds the aggregate with
`references: []`), so no reference row has ever been covered by the integrity
digest — tampering with a stored `reference_type` is not detected. That is a
pre-existing property of the v1 integrity model, not something the new
vocabulary introduces or widens; see "Integrity model and its limits".
Bringing references under the digest would invalidate every aggregate digest
already stored and is separate, breaking work.

## Future extensions

The `governance_references` table and `GovernanceReferenceRecord` exist
so future Passport events, Evidence Bundles, Assurance records, and
execution records can attach to committed evaluations without schema
changes. `GovernanceCorrectionRecord` is reserved (type only) so future
corrections are appended, never updated in place. The recommended next
step is PR-005 — AOC Enterprise Evidence Bundle v1.
