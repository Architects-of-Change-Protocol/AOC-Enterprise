# Assurance Control Model (PR-007)

An `AssuranceControlDefinition` binds one control to one framework version
and one domain: title/description/objective, `controlType`
(`preventive | detective | corrective | governance | evidence`),
`criticality` (`mandatory | recommended | optional`), an evaluation method,
evidence requirement references, a criteria tree, scoring parameters, an
optional framework-defined severity mapping, optional remediation guidance,
and an optional applicability rule.

## Criteria (closed data union — never executable code)

| Kind | Shape | Decided by |
| --- | --- | --- |
| `boolean` | `{ metric, expected }` | a metric derived from accepted evidence |
| `threshold` | `{ metric, operator: gte/gt/lte/lt/eq/neq, value }` | a numeric metric derived from accepted evidence |
| `evidence_presence` | `{ requirementIds, minimumSatisfied, allMandatory }` | evidence resolution statuses |
| `composite` | `{ operator: all/any/minimum, minimum?, criteria[] }` | recursive aggregation |
| `manual_review` | `{ questions, requiredReviewerRole?, requiredEvidenceRequirementIds? }` | an attributable `AssuranceManualReviewRecord` |

## Evaluation semantics (`control-evaluator.ts`)

The evaluator is pure and deterministic. Internal quad-state per criteria
tree: `met | partial | unmet | undetermined`, mapped to
`pass | partial | fail | unknown`.

- **boolean/threshold**: missing or wrongly-typed metric → `undetermined`
  (`CONTROL_METRIC_UNAVAILABLE`); otherwise compared exactly.
- **evidence_presence**: satisfied resolutions count toward the minimum;
  partially-satisfied resolutions can only ever produce `partial`; absence
  of evidence is `undetermined` — **absence of evidence is never `fail`**
  (mission section 63). Only a `fail` contradiction policy can fail this
  criteria kind.
- **composite all**: any unmet → unmet; else any undetermined →
  undetermined; else any partial → partial; else met. **any**: any met →
  met; else partial; else undetermined; else unmet. **minimum m**: met ≥ m →
  met; met+partial ≥ m → partial; met+partial+undetermined ≥ m →
  undetermined; else unmet.
- **manual_review**: with no attributable review by the required role →
  `manual_review_required` plus a structured
  `AssuranceManualReviewRequirement`. With one, the latest applicable
  review's outcome maps `pass/partial/fail`; `insufficient_evidence` maps to
  `unknown`.
- **Contradictions** (before criteria evaluation): the requirement's policy
  decides — `fail`, `manual_review_required`, or `unknown` — and the
  conflicting evidence reference ids, reason, and applied policy are
  recorded (mission section 61).
- **not_applicable**: produced only by the control's `applicability` rule
  (subject-type list + justification). Callers can never mark a control N/A
  (mission section 62). N/A carries no hidden score benefit — it is excluded
  from the denominator, and the exclusion is in the calculation trace.

## Traceability

Every evaluation carries `criteriaResults` (per-criterion: type,
description, tri-state `satisfied`, metric, expected, actual, reason
codes), stable control reason codes
(`CONTROL_CRITERIA_SATISFIED`, `CONTROL_CRITERIA_UNMET`,
`CONTROL_METRIC_UNAVAILABLE`, `CONTROL_EVIDENCE_MISSING`,
`CONTROL_EVIDENCE_PARTIAL`, `CONTROL_EVIDENCE_CONTRADICTORY`,
`CONTROL_MANUAL_REVIEW_PENDING`, `CONTROL_MANUAL_REVIEW_APPLIED`,
`CONTROL_NOT_APPLICABLE_BY_RULE`, …), accepted/rejected evidence reference
ids, a plain-language summary, `evaluatedAt`, and
`evaluatorVersion` (`aoc.assurance-evaluator.v1`).

## Confidence (deterministic evidence quality — never probabilistic)

- **high**: every relevant resolution satisfied, every accepted reference
  verified, no contradictions.
- **medium**: criteria sufficiently supported but some evidence indirect,
  unverified-yet-acceptable, or no evidence-backed resolutions were needed.
- **low**: any resolution unavailable/unsatisfied, any contradiction, or a
  status of `unknown`/`manual_review_required`.
