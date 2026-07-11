# Governance Store Migration v1 — PR-002 persistence → Governance Store

How existing PR-002 Enterprise databases (and code consumers) move to the
Governance Store v1 schema and API. The migration is automatic,
transactional, idempotent, and non-destructive.

## Old schema (PR-002)

`GovernanceRequests(request_id PK, correlation_id, actor_id, action_type,
resource_scope, organization_id, requested_at, received_at,
request_payload)`,
`GovernanceEvaluations(decision_id PK, request_id FK, status,
reason_codes, summary, kernel_version, evaluated_at, correlation_id)`,
`GovernanceTraces(decision_id PK/FK, steps_json)`,
`RuntimeEvents(event_id PK, event_type, request_id, decision_id,
correlation_id, occurred_at, payload)`,
`RuntimeVersions(boot_id PK, runtime_version, kernel_version,
recorded_at)`.

## New schema (v1)

See `docs/enterprise/AOC_GOVERNANCE_RECORD_MODEL.md`. SQLite identifiers
are case-insensitive, but the v1 snake_case names differ from the PR-002
CamelCase names by their underscores (`governance_requests` ≠
`GovernanceRequests`), so both generations coexist in one file with no
collision.

## What migration does

On store construction, inside ONE transaction with schema creation:

1. If `GovernanceRequests`/`GovernanceEvaluations` exist and contain rows
   whose `request_id` is not yet in `governance_requests`, each legacy
   request+evaluation(+trace) triple is rebuilt through the same
   projection pipeline live appends use (`buildGovernanceAggregate`):
   sanitization, digests, chain position — then inserted into the v1
   tables.
2. Legacy `RuntimeEvents` rows are copied into `governance_events` as
   standalone event records (aggregate type `governance_request`),
   preserving their ids, types, correlation, and payloads. They are NOT
   embedded in the migrated aggregates, because PR-002 never wrote them
   atomically with the evaluation — pretending otherwise would falsify
   history.
3. A `governance_store_versions` row records
   `migration_state = 'migrated-from-pr-002'` (or `'fresh'` for a new
   database) with the migrated count.
4. `RuntimeVersions` continues to serve the unchanged boot-version ledger.

If any step fails, the whole transaction rolls back: the database is left
exactly as PR-002 wrote it, and store construction fails with
`GOVERNANCE_STORE_TRANSACTION_FAILED` (readiness stays false).

## Data mapping

| PR-002 | v1 |
|---|---|
| `GovernanceRequests.request_payload` (raw `KernelEvaluationRequest`) | `governance_requests.request_payload_json` (sanitized projection) + denormalized columns |
| `GovernanceEvaluations` row | `governance_evaluations` row + `governance_reason_codes` rows |
| `GovernanceTraces.steps_json` (whole `KernelTrace`) | `governance_trace_steps` rows (normalized, per-step digests) |
| `RuntimeEvents` rows | `governance_events` standalone rows |
| — | `governance_record_metadata` (defaults below) + `governance_integrity` (computed at migration) |

## Unavailable historical fields (not invented)

PR-002 never stored these, so migrated aggregates carry honest defaults
instead of fabricated history:

- full Kernel result sub-objects (`recognition`, `authority`, `policies`,
  `approval`, `evidence`) — the migrated `resultPayload` contains only the
  fields PR-002 stored (ids, status, reason codes, summary, versions,
  timestamps);
- per-decision Enterprise version and lifecycle state →
  `enterpriseVersion: 'unrecorded'`, `lifecycleState: 'unrecorded'`,
  empty module snapshot;
- original persistence time → `persistedAt`/`createdAt` are the
  **migration** time (PR-002 recorded no persistence timestamp);
  `requestedAt`/`receivedAt`/`evaluatedAt` are the historical values.

## Integrity for migrated data

Digests and chain positions are computed **at migration time** over the
migrated (sanitized) records. They attest that the record has not changed
*since migration* — they cannot attest to anything about the bytes PR-002
wrote before that. This limitation is inherent and deliberate.

## Distinguishing migrated records

Every migrated aggregate carries
`metadata.migrationSource = "pr-002-governance-store"`
(`GOVERNANCE_MIGRATION_SOURCE_PR_002`); live appends have no
`migrationSource`. Migrated record ids use a recognizable
`-migrated-<n>` suffix.

## Idempotency and re-runs

Migration keys on `request_id`: a legacy request already present in
`governance_requests` is skipped, so reopening the database (or crashing
between opens) never migrates anything twice. Migrated decisions
participate in normal idempotency: resubmitting the same legacy
`requestId` with the same payload replays the stored decision; a
different payload conflicts (409).

An orphan legacy evaluation (no matching request row) cannot be
reconstructed and is left untouched in the legacy tables; it is not
copied and not counted.

## Rollback limitations

- Before/at first PR-004 boot: full rollback is trivial — the legacy
  tables were never modified; delete the v1 tables (or restore the
  pre-migration backup) and run a PR-002 build.
- After new decisions have been appended to v1 tables: rolling back to
  PR-002 loses those new aggregates (PR-002 cannot read v1 tables).
  **Take a backup before first boot of a PR-004 build.**

## Compatibility period (code consumers)

- The `GovernanceStore` interface keeps the entire PR-002 method surface
  (`persistEvaluation`, `getRequestById`, `getEvaluationByRequestId`,
  `getEvaluationByDecisionId`, `getTraceByDecisionId`,
  `appendEnterpriseEvent`, `listEnterpriseEvents`,
  `recordEnterpriseVersion`, `getLatestEnterpriseVersion`,
  `checkConnectivity`, `close`) as a deprecated compatibility surface
  implemented on top of the v1 model — one storage implementation per
  provider, never two.
- Old import paths (`src/enterprise/persistence/*`) remain as deprecated
  re-export shims; `createInMemoryGovernanceStore()` /
  `createSqliteGovernanceStore(path)` keep their signatures.
- Record type changes: `GovernanceRequestRecord`/`GovernanceEvaluationRecord`
  are now the richer v1 shapes (supersets of the old fields except that
  `requestPayload` is the sanitized projection typed as a plain record);
  the old whole-trace read shape is `GovernanceDecisionTraceRecord`
  (`GovernanceTraceRecord` now names one normalized step).
- The Persistence module id `aoc.enterprise.persistence` became
  `aoc.enterprise.governance-store`; `PERSISTENCE_MODULE_ID` is retained
  as a deprecated alias of the new id.
- Deprecated surfaces are kept for one transition period and documented
  for removal in a future major revision.
