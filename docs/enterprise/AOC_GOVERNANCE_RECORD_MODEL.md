# AOC Governance Record Model v1

Canonical contracts of the Governance Store (PR-004). Source of truth:
`src/enterprise/governance-store/contracts.ts`.

## Relationships

```
GovernanceRequest (governance_requests)
    1
    │  request_id
    ▼
GovernanceEvaluation (governance_evaluations)          ← aggregate root
    1
    ├── N GovernanceTraceRecord   (governance_trace_steps,   UNIQUE(evaluation_id, sequence))
    ├── N GovernanceReasonRecord  (governance_reason_codes,  UNIQUE(evaluation_id, sequence))
    ├── N GovernanceEventRecord   (governance_events,        embedded evaluation events)
    ├── 1 GovernanceRecordMetadata(governance_record_metadata, UNIQUE(evaluation_id))
    ├── 1 GovernanceIntegrityMetadata (governance_integrity, UNIQUE(evaluation_id), UNIQUE(chain_position))
    ├── N GovernanceReferenceRecord (governance_references, appended after the seal)
    └── 0..1 GovernanceReferenceChainState (governance_reference_chains, PK(evaluation_id))

GovernanceIdempotencyRecord (governance_idempotency, PK(scope, idempotency_key)) → evaluation_id
Lifecycle/module events (governance_events) link by correlation, never by foreign key.
```

`GovernanceRecord` is the read/reconstruction aggregate of all of the
above — it is never stored as one row. Its `recordId` is the evaluation
record's `recordId` (the evaluation is the aggregate root).

## Identifier semantics

| Identifier | Meaning | Uniqueness scope |
|---|---|---|
| `requestId` | one governance request | global across the store (`UNIQUE(request_id)`); caller-supplied or Host-generated |
| `evaluationId` | one Store-recorded evaluation aggregate | global, Store-generated |
| `decisionId` | the Kernel's decision identity | global (`UNIQUE(decision_id)`), Kernel-generated |
| `recordId` | one stored row (request/evaluation) | global, Store-generated |
| `eventId` | one event | global, publisher-generated |
| `correlationId` | caller-defined correlation across calls | caller-defined, not unique |
| `causationId` | the event that caused this event | references an `eventId` |
| `referenceId` | one extension reference | global |

One id is never reused for multiple semantic roles. Store-generated ids
come from an injected id generator (deterministic under test).

## Timestamp semantics (ISO-8601 UTC)

| Field | Meaning | Source |
|---|---|---|
| `requestedAt` | when the caller says the request happened | caller / Kernel request |
| `receivedAt` | when Enterprise received it | Enterprise clock |
| `evaluatedAt` | when the Kernel evaluated | Kernel result (never overwritten) |
| `occurredAt` | when an event happened | event source |
| `persistedAt` | when the Store committed | injected Store clock |
| `createdAt` | when a row was written | injected Store clock |
| `verifiedAt` | when a verification ran | injected Store clock |

## Database schema (SQLite, `aoc.governance-store.schema.v1`)

Full DDL: `SCHEMA_V1` in
`src/enterprise/governance-store/sqlite-governance-store.ts`.

| Table | Keys/constraints | Indexes |
|---|---|---|
| `governance_requests` | PK `record_id`; `UNIQUE(request_id)` | `correlation_id`; `(organization_id, requested_at)`; `(actor_id, requested_at)`; `(action_type, requested_at)` |
| `governance_evaluations` | PK `record_id`; `UNIQUE(evaluation_id)`; `UNIQUE(decision_id)`; FK `request_id → governance_requests` | `request_id`; `correlation_id`; `(status, evaluated_at)`; `kernel_version`; `enterprise_version` |
| `governance_trace_steps` | PK `trace_record_id`; `UNIQUE(evaluation_id, sequence)`; FK `evaluation_id` | — |
| `governance_reason_codes` | PK `reason_record_id`; `UNIQUE(evaluation_id, sequence)`; FK `evaluation_id` | `reason_code`; `(evaluation_id, reason_code)` |
| `governance_events` | PK `event_id`; `UNIQUE(aggregate_type, aggregate_id, sequence)` | `(aggregate_type, aggregate_id)`; `request_id`; `correlation_id`; `causation_id`; `(event_type, occurred_at)` |
| `governance_record_metadata` | PK `metadata_id`; `UNIQUE(evaluation_id)`; FK `evaluation_id` | — |
| `governance_integrity` | PK `integrity_id`; `UNIQUE(evaluation_id)`; `UNIQUE(chain_position)`; FK `evaluation_id` | — |
| `governance_idempotency` | PK `(scope, idempotency_key)`; FK `evaluation_id` | — |
| `governance_references` | PK `reference_id`; FK `evaluation_id`; `UNIQUE(evaluation_id, sequence)` | `evaluation_id` |
| `governance_reference_chains` | PK `evaluation_id`; FK `evaluation_id` | — |
| `governance_store_versions` | PK autoincrement `id` | — |
| `RuntimeVersions` | PK `boot_id` (unchanged PR-002 boot ledger) | — |

Notes:
- `governance_events.aggregate_id` is polymorphic (evaluation id,
  module id, or lifecycle correlation id) and therefore deliberately not
  a foreign key; evaluation events additionally carry denormalized
  `request_id`/`decision_id` reference columns.
- `PRAGMA foreign_keys = ON` on every connection; the PR-002 tables
  (`GovernanceRequests`, `GovernanceEvaluations`, `GovernanceTraces`,
  `RuntimeEvents`) remain untouched after migration.
- `governance_references.sequence` is NULL on rows written before reference
  integrity existed. SQLite treats NULLs as distinct in a unique index, so
  `UNIQUE(evaluation_id, sequence)` constrains protected rows only. That index
  and `governance_reference_chains` are created by
  `ensureReferenceIntegritySchema` rather than `SCHEMA_V1`, because on an
  upgraded database the column they depend on exists only after its
  `ALTER TABLE`.

## Canonical record types

### GovernanceRequestRecord (`aoc.governance-request-record.v1`)

`recordId`, `requestId`, `correlationId?`, `actorId`, `actorType?`,
`organizationId?`, `actionType`, `actionDomain?`, `resourceScope`,
`targetType?`, `targetId?`, `requestedAt`, `receivedAt`,
`requestContract`, `requestPayload` (sanitized projection of the
normalized `KernelEvaluationRequest`), `payloadDigest`.

### GovernanceEvaluationRecord (`aoc.governance-evaluation-record.v1`)

`recordId`, `evaluationId`, `decisionId`, `requestId`, `correlationId?`,
`status` (`KernelDecisionStatus`, unchanged), `summary`, `reasonCodes`
(exact Kernel order, duplicates preserved), `evaluatedAt`, `persistedAt`,
`kernelVersion`, `enterpriseVersion`, `evaluationContract`,
`resultPayload` (sanitized full result minus the normalized trace),
`resultDigest`.

### GovernanceTraceRecord (`aoc.governance-trace-record.v1`)

`traceRecordId`, `evaluationId`, `sequence` (unique per evaluation),
`operator`, `status`, `reasonCodes`, `startedAt?`, `completedAt?`,
`metadata?` (sanitized), `traceContract`, `traceDigest`. The original
`KernelTrace` reassembles via `toKernelTrace(record)`.

### GovernanceReasonRecord

`reasonRecordId`, `evaluationId`, `sequence`, `reasonCode`. Reason codes
are stored both embedded (authoritative order on the evaluation record)
and normalized (queryable) — duplicates are semantically allowed because
the Kernel's exact output is the truth being preserved.

### GovernanceEventRecord (`aoc.governance-event-record.v1`)

`eventId`, `eventType`, `aggregateType`
(`governance_request | governance_evaluation | enterprise_lifecycle |
enterprise_module`), `aggregateId`, `requestId?`, `decisionId?`,
`correlationId?`, `causationId?`, `sequence?`, `occurredAt`,
`persistedAt`, `enterpriseVersion`, `kernelVersion?`, `eventContract`,
`eventPayload` (sanitized), `eventDigest`. Evaluation events are embedded
in the aggregate; within one aggregate the `GovernanceEvaluationRequested`
event is the causation source for subsequent events. Ordering: explicit
`sequence`, then `occurredAt`, then rowid/eventId as tie-breaker — never
timestamps alone.

### GovernanceRecordMetadata

`metadataId`, `evaluationId`, `enterpriseVersion`, `kernelVersion`,
`lifecycleState`, `moduleSnapshot` (`{moduleId, version, state,
required}` per module), `providerSnapshot?` (`{providerType, providerId?,
providerVersion?, ready}` only — never credentials or configuration),
`environment?`, `buildVersion?`, `createdAt`, `schemaVersion`,
`migrationSource?`.

### GovernanceIntegrityMetadata (`aoc.governance-integrity-record.v1`)

`integrityId`, `evaluationId`, `algorithm: 'sha256'`,
`canonicalizationVersion: 'aoc.canonical-json.v1'`, `requestDigest`,
`evaluationDigest`, `traceDigest`, `eventsDigest`, `metadataDigest`,
`aggregateDigest`, `previousAggregateDigest?` (store-scoped chain),
`chainPosition` (monotonic, unique), `createdAt`. An integrity mechanism —
not a signature, not non-repudiation.

### GovernanceReferenceRecord (`aoc.governance-reference-record.v1`)

`referenceId`, `evaluationId`, `referenceType` (`passport_event |
evidence_bundle | assurance_record | execution_record |
external_artifact | authorization_artifact`), `externalId`,
`externalVersion?`, `digest?`, `uri?`, `createdAt`, plus the Store-computed
reference-integrity fields `sequence?`, `integrityVersion?`,
`previousReferenceDigest?`, `referenceDigest?`. The canonical list is
`GOVERNANCE_REFERENCE_TYPES`; the union is derived from it.

Callers pass a `GovernanceReferenceInput` — the record minus the four
integrity fields — so a caller can neither choose its own chain position nor
present a digest the Store did not compute. The integrity fields are optional
because rows written before the mechanism existed genuinely lack them; such
rows are classified `legacy_unprotected`. Note that `digest?` (the referenced
artifact's own content digest, caller-supplied, never verified) and
`referenceDigest?` (the Store's tamper-evidence digest) are different things.
See "Two integrity domains" in `AOC_ENTERPRISE_GOVERNANCE_STORE.md`.

`authorization_artifact` names a durable artifact **produced by AOC
Enterprise** that records or embodies authorization resulting from a governed
enforcement decision — today `TokenizationMandate` and
`CollateralizationMandate`. `external_artifact` is reserved for artifacts
originating **outside** the AOC authorization machinery, and
`execution_record` for a report that an external system acted on an
authorization AOC issued. The classification is evidence vocabulary and never
authority; see "Reference vocabulary" in
`AOC_ENTERPRISE_GOVERNANCE_STORE.md` for the trust boundary, the
compatibility rules, and how historical rows are treated.

The Store preserves references; it never interprets them as authority.

### GovernanceCorrectionRecord (reserved)

`correctionId`, `evaluationId`, `correctionType`
(`metadata_correction | classification_correction | redaction |
supersession`), `reason`, `correctedBy`, `createdAt`,
`replacementEvaluationId?`. Type reserved in v1 — no correction API exists;
future corrections are appended records, never updates.

### GovernanceIdempotencyRecord

`scope`, `idempotencyKey`, `requestDigest`, `evaluationId`, `createdAt`.
Scope is `org:<organizationId>` or `global` — always tenant-qualified.

### GovernanceReplayMetadata (derived)

`requestContract`, `evaluationContract`, `kernelVersion`,
`enterpriseVersion`, `providerVersions` — derived from a stored aggregate
by `toGovernanceReplayMetadata`; only values that actually exist are
reported, and deterministic re-evaluation is not claimed.
