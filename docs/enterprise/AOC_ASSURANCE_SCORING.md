# Assurance Scoring (PR-007)

The framework owns scoring (`AssuranceScoringModel`); the UI does not, HTTP
controllers do not, and callers cannot re-map statuses to numbers.

## Status mapping

`statusScores` maps every control status to a 0..1 multiplier or `null`
("the policy decides"). `aoc.saf.scoring@1.0.0`:

```
pass                   → 1.00
partial                → 0.50
fail                   → 0.00
unknown                → unknownPolicy        ('zero' in aoc.saf: scored 0, kept in the denominator)
not_applicable         → always excluded from the denominator
manual_review_required → manualReviewPolicy   ('provisional' in aoc.saf: excluded, result marked provisional)
```

Policies: `unknownPolicy: zero | exclude | manual_review`;
`manualReviewPolicy: zero | exclude | provisional`.

## Domain formula (`computeDomainAssessments`)

```
Domain Score = Σ(status score × control weight) ÷ Σ(applicable control weights)
normalizedScore = Domain Score × 100, rounded half-up to 2 decimals
```

Control weights come from `scoringModel.controlWeights[controlId]`, falling
back to the control's own `scoring.weight`. Every domain result carries a
per-control `AssuranceScoreContribution` trace (`controlId`, status,
`rawValue`, `weight`, `weightedValue`, `excluded`, `exclusionReason`) —
sufficient to reconstruct the exact score, which the verification service
does. There is no hidden normalization; rounding (half-up, 2 decimals) is
the single documented rule, applied only at output boundaries.

## Blocking controls

Where `blockingRule` is `domain_override` or `both`, a failed blocking
control forces the domain to `unhealthy` regardless of its numeric average,
names the blocking finding ids, and states the override in the domain
summary. Example: numeric 94 + `revocation-enforced = fail` → `unhealthy`.
Averages never conceal blocking failures. Where `blockingRule` is
`eligibility_only` or `both`, the same failures block eligibility.

## Domain status

`not_applicable` (no evaluations or all N/A) → `unknown` (no scoreable
results) → `unhealthy` (blocking failure or `normalizedScore <
minimumScore`) → `degraded` (any fail/partial/unknown/manual-review) →
`healthy`.

## Overall score (`computeOverallScore`)

```
Overall = Σ(domain normalizedScore × domain weight) ÷ Σ(included domain weights)
```

Domain weights come from `scoringModel.domainWeights[domainId]`, falling
back to the domain's `weight`. `not_applicable`/`unknown` domains are
excluded with explicit exclusion reasons in the
`AssuranceDomainScoreContribution` trace. The `AssuranceScore` carries
`rawScore`, `maximumScore`, `normalizedScore`, per-domain references, the
full trace, `methodologyId`/`methodologyVersion`, and `calculatedAt`.

## No universal trust score

A score is meaningful only with its framework ID/version, subject, scope,
evidence cutoff, assessment date, and methodology version — all carried on
the enclosing assessment and restated in every report's executive summary.
`86` is never "trust: 86"; it is "aoc.saf 1.0.0, subject X, scope Y,
evidence cutoff Z: 86/100 under aoc.saf.scoring@1.0.0".

## Verification

`verifyAssuranceAssessment` recomputes the domain assessments from the
stored control evaluations and the overall score from the stored domain
assessments via the framework's scoring model, and compares — stored numbers
are never trusted without recomputation.
