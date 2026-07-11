# Assurance Evidence Model (PR-007)

## Principles

- Only the nine `AssuranceEvidenceType`s are valid Assurance evidence —
  arbitrary JSON never is.
- The Assurance Store holds **references and bounded projections**, never
  copies of Governance Records, Evidence Bundles, or Passport aggregates.
  `externalId` + `digest` are enough to re-fetch and re-verify the original
  from its own store.
- Every reference carries provenance (`sourceSystem`, `sourceType`,
  `collectedBy`, `collectedAt`, `originalDigest`, `disclosurePolicy`).
  `chainOfCustodyReference` stays absent in v1 — no custody controls exist,
  so none are claimed.
- Determinism: every age/window check is measured against the scope's
  `evidenceCutoffAt`, never the wall clock.

## Evidence requirements

`AssuranceEvidenceRequirement`: accepted types, `minimumCount`,
`maximumAgeDays`, `mustBeVerified`, `mustBeOrganizationBound`,
`mustReferenceSubject`, `requiredDisclosureLevels`, `manualEvidenceAllowed`,
`contradictionPolicy` (`fail | manual_review | unknown`).

## How each source is consumed (`evidence-resolver.ts`)

| Type | Source | Gathering | `verified` means |
| --- | --- | --- | --- |
| `governance_record` | Governance Store public contract | tenant-scoped `query()` (actor-scoped for agent/passport subjects, bounded window, bounded candidate count), then `verify()` per hit | the stored aggregate's digests recompute (`governance-verify:<evaluationId>`) |
| `evidence_bundle` | Evidence Bundle Store | `listByEvaluationId()` over the gathered governance evaluations | `verifyEvidenceBundle` structural verification passes |
| `agent_passport` | Passport Store | `findByAgentId`/`reconstruct` + `verify` for the subject's passport | event chain and lifecycle verify |
| `passport_view` | manual/injected references only in v1 | — | as supplied |
| `enterprise_health` / `module_health` / `lifecycle_event` | injected runtime-health snapshot (Enterprise lifecycle) | one bounded observation per collection | live internal observation |
| `control_attestation` / `external_artifact_reference` | manually supplied references | accepted only where `manualEvidenceAllowed` | as supplied by the attributable collector |

Metadata carried on references is a bounded projection (e.g. decision
status and reason codes for governance records; passport status, chain and
lifecycle validity; module status) — never payloads.

## Rejection reason codes (stable)

`EVIDENCE_NOT_FOUND`, `EVIDENCE_TYPE_NOT_ACCEPTED`, `EVIDENCE_TOO_OLD`,
`EVIDENCE_UNVERIFIED`, `EVIDENCE_WRONG_TENANT`, `EVIDENCE_WRONG_SUBJECT`,
`EVIDENCE_DISCLOSURE_INSUFFICIENT`, `EVIDENCE_DIGEST_MISMATCH`,
`EVIDENCE_VERSION_UNSUPPORTED`, `EVIDENCE_INCOMPLETE`,
`EVIDENCE_CONTRADICTORY`, `EVIDENCE_SOURCE_UNAVAILABLE`. Every rejected
reference carries one or more codes plus a human-readable detail.

## Resolution result

`AssuranceEvidenceResolution`: `satisfied` (accepted ≥ minimum),
`partially_satisfied` (some but not enough), `unsatisfied` (sources
reachable, nothing acceptable), `unavailable` (sources unreachable) — plus
accepted references, rejected references, missing-evidence descriptions,
deterministic contradictions (same `(type, externalId)` with different
digests), `resolvedAt`, and `resolverVersion`
(`aoc.assurance-evidence-resolver.v1`).

## Metric derivation (`metrics.ts`)

Boolean/threshold criteria read ONLY metrics derived from **accepted**
evidence: `governance.records.count/all_verified/denied_count/…`,
`evidence.bundles.count/all_verified`,
`passport.present/verified/active/chain_valid/lifecycle_valid/revoked/…`,
`enterprise.ready`, `modules.count/unhealthy_count`, plus attestation-borne
named metrics (`metadata: { metric, value }`). An underivable metric is
absent → the control is `unknown`, never silently false/0. This is the
"Verified Evidence" leg of the Assurance Equation: evidence volume is not
evidence quality, and no metric exists without accepted evidence behind it.
