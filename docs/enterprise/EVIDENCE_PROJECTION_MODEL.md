# Evidence Projection Model

How `src/enterprise/evidence/projector.ts` turns one `GovernanceRecord`
(PR-004) plus one `DisclosurePolicy` into one `EvidenceBundle` (PR-005).

## The one-way projection

```
GovernanceRecord ──▶ DisclosurePolicy ──▶ EvidenceBundle
```

This direction only. There is no function anywhere in this module that
reconstructs a `GovernanceRecord` from an `EvidenceBundle` -- a Bundle
deliberately does not carry enough information to do so. Verification
(`verifyEvidenceBundle`) checks a Bundle *against* a supplied
`GovernanceRecord`; it never derives one.

## Stage 1: the bounded full field view

`buildFullFieldView` first turns the `GovernanceRecord` into a bounded,
already-non-sensitive projection keyed by the fixed vocabulary
(`EVIDENCE_FIELD_KEYS` in `contracts.ts`):

| Field | Derived from |
|---|---|
| `source.organizationId` | `record.request.organizationId` |
| `subject.actionType` | `record.request.actionType` |
| `subject.resourceScope` | `record.request.resourceScope` |
| `subject.description` | `"${actionType} on ${resourceScope}"` |
| `evidence.status` | `record.evaluation.status` |
| `evidence.summary` | `record.evaluation.summary` |
| `evidence.reasonCodes` | `record.evaluation.reasonCodes` |
| `evidence.trace` | `record.trace`, reduced to `{ sequence, operator, status, reasonCodes }` per step -- never the raw `GovernanceTraceRecord` (no `traceRecordId`, `traceDigest`, or step `metadata`) |
| `evidence.events` | `record.events`, reduced to `{ eventType, occurredAt }` -- never the event payload |
| `evidence.metadata` | a fixed, derived summary (`lifecycleState`, `moduleCount`, `traceStepCount`, `eventCount`) -- **never** the raw `GovernanceRecordMetadata` (no module/provider snapshots, no build/environment strings, no arbitrary keys) |

This stage alone already excludes `requestPayload`, `resultPayload`, every
record id, every digest, and every raw runtime snapshot. Even the FULL
disclosure level never receives a copy of the Governance Record --
"complete disclosure" still means "every field on this fixed, bounded
list," not "everything the Store knows."

## Stage 2: disclosure policy filtering

`applyDisclosurePolicy` walks `EVIDENCE_FIELD_KEYS` and, for each field:

- **hidden** → omitted from the Bundle entirely (the key does not appear).
- **redacted** → the key appears, its value is replaced with
  `EVIDENCE_DISCLOSURE_REDACTED_VALUE`.
- **visible** (and not redacted) → passed through unchanged.

A policy's `visibleFields`/`hiddenFields` partition the full field
vocabulary exactly (enforced at module load by
`validateDisclosurePolicy` in `disclosure-policies.ts`); a field can never
be silently omitted by accident.

## Stage 3: redaction (defense in depth)

The assembled `subject` and `evidence` sections are passed through
`redactSensitiveValues` (reused, unmodified, from
`src/enterprise/governance-store/redaction.ts`) before being placed on the
Bundle. This is independent of, and in addition to, disclosure-policy
redaction: even if a future field addition accidentally carried a
token/password/secret-shaped key, it would still never reach a Bundle.
`EVIDENCE_DISCLOSURE_REDACTED_VALUE` (policy redaction) and
`GOVERNANCE_REDACTED_VALUE` (secret redaction) are deliberately distinct
markers -- a consumer can tell "this was a disclosure decision" from "this
was a secret" apart. See `docs/enterprise/DISCLOSURE_POLICIES.md` and
`src/enterprise/__tests__/evidence-redaction.test.ts`.

## Stage 4: integrity and provenance

- `bundleDigest = computeDigest(bundleDigestInput(bundleWithoutIntegrity))`
  -- SHA-256 over the canonical serialization (`aoc.canonical-json.v1`,
  reused from the Governance Store) of every section except `integrity`
  itself.
- `recordDigest = record.integrity.aggregateDigest`, carried verbatim.
- `verificationDigest = computeDigest({ bundleDigest, recordDigest, policyId, policyVersion, bundleVersion })`.
- `verification` (provenance): `createdBy`, `generatedAt`,
  `projectionVersion`, `projectionPolicy` (the policy id that produced this
  Bundle), `projectionEngine` (`EVIDENCE_PROJECTION_ENGINE_VERSION`) -- so
  the projection itself is auditable, not just the decision it projects.

## Purity

`buildEvidenceBundle(record, policy, deps)` is pure over its inputs given
the injected `now`/`nextId`: identical `(record, policy)` always produce
identical disclosed content and identical `bundleDigest`/`recordDigest`.
Only `bundleId`, `createdAt`, and `verification.generatedAt` vary across
separate calls -- exactly the "same Record, many Bundles" shape the
Bundle Store is built around.
