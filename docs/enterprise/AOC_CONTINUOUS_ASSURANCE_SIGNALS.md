# Continuous Assurance Signals (PR-007)

A signal is an append-only observation that a completed assessment MAY no
longer represent current conditions. Signals never rewrite a completed
assessment; staleness and the continuous state are always **derived** from
immutable assessments plus appended signals — there is no mutable
"current state" row anywhere.

## Signal catalog (only signals with real Assurance relevance)

| Signal type | Default severity | Deterministic outcomes |
| --- | --- | --- |
| `governance_decision_denied` | informational | record_only |
| `governance_integrity_failed` | critical | mark_assessment_stale, require_manual_review |
| `evidence_bundle_verification_failed` | high | mark_assessment_stale |
| `passport_suspended` | high | mark_assessment_stale |
| `passport_revoked` | critical | mark_assessment_stale, change_eligibility, request_reassessment |
| `passport_integrity_failed` | critical | mark_assessment_stale, require_manual_review |
| `enterprise_module_unhealthy` | medium | mark_assessment_stale |
| `enterprise_readiness_lost` | high | mark_assessment_stale |
| `control_evidence_expired` | medium | mark_assessment_stale |
| `control_evidence_missing` | medium | open_finding |
| `finding_reopened` | high | reopen_finding, mark_assessment_stale |
| `remediation_evidence_added` | informational | record_only |
| `framework_version_changed` | medium | mark_assessment_stale, request_reassessment |

Not every log line is a signal — unsupported types are rejected
(`ASSURANCE_SIGNAL_INVALID`). Every signal carries organization/subject
binding, source type/id/digest, affected control/domain ids, occurred/observed
timestamps, a bounded payload, and a SHA-256 `signalDigest`.

## Processing (`processSignal`)

Appends the signal (tenant-scoped, idempotent by signal id), then applies
the type's outcomes against the subject's **latest completed assessment**:

- `mark_assessment_stale` — telemetry + event; the stored assessment is
  untouched (staleness is derived at read time).
- `open_finding` — appends a new finding (+ Created event) attached to the
  latest completed assessment's findings table; the frozen aggregate is
  untouched.
- `reopen_finding` — appends `AssuranceFindingReopened` to the named
  finding's event history.
- `request_reassessment` — records the recommendation (telemetry + event);
  the Runtime **never runs the reassessment automatically** (no automatic
  enforcement).
- `change_eligibility` — derived only: `eligibilityState` becomes
  `suspended_by_signal`; stored eligibility results stay frozen.
- `require_manual_review` — recorded in the processing detail for the next
  assessment.

## Staleness (derived, mission section 45)

An assessment is stale when a stale-marking signal for its subject was
observed at/after its completion. Framework version changes, evidence
expiry, verification failures, Passport suspension/revocation, readiness
loss, module unhealth, and finding reopening all mark staleness through
their signals. **Stale does not mean failed** — it means the prior result
may no longer represent current conditions; the remedy is reassessment.

## Continuous state (`deriveContinuousAssuranceState`)

`ContinuousAssuranceState` is recomputed on every read from the latest
completed assessment, its open findings, and the subject's signals:

- `unknown` — no completed assessment exists;
- `critical` — an active critical signal or open critical finding;
- `degraded` — an active high signal or open high finding;
- `stale` — stale reasons exist without critical/high conditions;
- `current` — otherwise.

It carries open-finding counts by severity, active signal ids, stale
reasons, and the derived eligibility state. Historical assessments remain
byte-identical throughout — verified by tests that compare the assessment
digest before and after signal processing.
