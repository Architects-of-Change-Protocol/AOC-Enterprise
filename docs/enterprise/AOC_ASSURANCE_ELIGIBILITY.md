# Assurance Eligibility (PR-007)

## Eligibility is not certification

An `AssuranceEligibilityResult` states that ONE assessment, under ONE
framework version and ONE immutable scope, satisfied ONE named profile's
thresholds. It is an internal, evidence-bound, reconstructable
determination. It is **not** a statutory certification, a legal opinion, an
external attestation, an auditor's signature, or a universal trust level —
and the repository's own claim-safety rules prohibit the wording
("certified compliant" is a prohibited overclaim phrase). Derived artifacts
are `AssuranceEligibilityCandidate`s — deliberately never certificates. No
internal profile may be renamed a certification without legal and governance
approval.

## Profiles

`AssuranceEligibilityProfile`: `minimumOverallScore`,
`minimumDomainScores`, `mandatoryControlIds` (must be `pass`),
`prohibitedOpenSeverities` (open/accepted/remediation_planned findings),
`minimumVerifiedEvidenceRate` (verified accepted references ÷ all accepted
references), `maximumEvidenceAgeDays` (against the scope's evidence
cutoff), `manualReviewRequired`. `aoc.saf` 1.0.0 ships neutral profiles
`baseline`, `advanced`, `continuous` (thresholds:
`AOC_SAF_V1_RUNTIME_MAPPING.md`).

## Evaluation (`evaluateEligibility` — deterministic)

Checks, in order, each contributing stable reason codes:

| Check | Reason code on failure |
| --- | --- |
| overall score ≥ minimum | `ELIGIBILITY_SCORE_BELOW_MINIMUM` |
| every named domain ≥ its minimum and not `unknown` | `ELIGIBILITY_DOMAIN_BELOW_MINIMUM` |
| every mandatory control `pass` | `ELIGIBILITY_MANDATORY_CONTROL_NOT_PASSED` |
| no framework blocking-control failure (blockingRule `eligibility_only`/`both`) | `ELIGIBILITY_BLOCKING_CONTROL_FAILED` |
| no open finding with a prohibited severity | `ELIGIBILITY_PROHIBITED_OPEN_FINDING` |
| verified-evidence rate ≥ minimum | `ELIGIBILITY_EVIDENCE_RATE_BELOW_MINIMUM` |
| no accepted evidence older than the maximum age | `ELIGIBILITY_EVIDENCE_TOO_OLD` |
| no pending manual reviews | `ELIGIBILITY_MANUAL_REVIEW_PENDING` |
| profile's own human gate | `ELIGIBILITY_PROFILE_MANUAL_REVIEW_REQUIRED` |

Success adds `ELIGIBILITY_SATISFIED`; a provisional result adds
`ELIGIBILITY_PROVISIONAL`. Blocking control ids and blocking finding ids are
named on the result — every determination is defensible.

## Provisional results

With unresolved required manual reviews an assessment is never `eligible`.
If every other check passes AND the framework's `manualReviewPolicy` is
`'provisional'`, the result is `provisional: true, eligible: false` —
visible, explained, and upgraded only by recording the review and
re-evaluating. Frameworks without a provisional policy cannot even complete
with pending reviews (`ASSURANCE_MANUAL_REVIEW_REQUIRED`).

## Immutability and signals

Eligibility results are part of the completed assessment's frozen content
(covered by `eligibilityDigest`). A later signal
(`passport_revoked` → `change_eligibility`) never edits them: the derived
`ContinuousAssuranceState.eligibilityState` becomes `suspended_by_signal`
while the historical record stays intact, and a reassessment produces the
new eligibility.
