# Soberanía Jurisdiction Costa Rica Base Pack v1

Pack ID:

```
aoc.jurisdiction.costa_rica.base.v1
```

Purpose:

Provides a Costa Rica jurisdiction context baseline for Soberanía policy-pack evaluation.

This pack identifies jurisdiction-aware review triggers, evidence requirements, approval requirements, export metadata and Control Plane-safe labels for Costa Rica-related actions.

This pack does not encode Costa Rican law.
This pack does not provide legal advice.
This pack does not certify compliance with Costa Rican law.
This pack does not claim legal completeness.
This pack does not replace Costa Rican counsel.
This pack does not determine whether an action is legally valid in Costa Rica.

## Default status

```
Default status:      demo_baseline
Default sourceStatus: system_authored
```

## Safety gate

This pack does not satisfy `counsel_reviewed` requirements unless explicitly created with `counsel_reviewed` or `counsel_attested` status and appropriate evidence in a future customer/counsel-reviewed context. A `demo_baseline` or `customer_validated` Costa Rica pack can never be treated as counsel-reviewed -- `satisfiesPolicyPackValidationStatus` (the same shared trust lattice every Soberanía policy pack uses) enforces this uniformly, so this pack cannot opt out of it.

If an action requires counsel-reviewed jurisdictional handling, resolving it through this pack produces `require_counsel_review`, never `allow`, unless the registered pack's own status actually satisfies `counsel_reviewed` (see `resolveCostaRicaJurisdictionAction` in `costa-rica-resolution.ts` and its tests).

## Architecture

```
Policy Pack Foundation
  |
Jurisdiction Pack Runtime
  |
Costa Rica Base Pack v1  (this module)
  |
Future domain/use-case packs
```

This pack is a `JurisdictionPack` (from the Jurisdiction Pack Runtime), which itself carries a real `PolicyPackManifest` (from the Policy Pack Foundation). It does not re-implement any manifest standard, validation-status lattice, safe-framing shape, overclaim scanner, or dependency resolver -- every one of those concerns is delegated:

| File | Provides |
| --- | --- |
| `costa-rica-constants.ts` | Pack id/name/version, jurisdiction id/country code, required baseline pack id |
| `costa-rica-jurisdiction-descriptor.ts` | `createCostaRicaJurisdictionDescriptor` -- a `JurisdictionDescriptor` (`countryCode: 'CR'`) extended with `known`/`ambiguous`/`conflictDetected`/`notes` |
| `costa-rica-review-triggers.ts` | `COSTA_RICA_REVIEW_TRIGGERS` -- operational review-trigger *categories* (not Costa Rican law), and `evaluateCostaRicaReviewTriggers` |
| `costa-rica-evidence-requirements.ts` | `COSTA_RICA_EVIDENCE_REQUIREMENTS` -- operational evidence signals, using the shared `PolicyPackEvidenceRequirement` shape |
| `costa-rica-approval-requirements.ts` | `COSTA_RICA_APPROVAL_REQUIREMENTS` -- review paths, using the shared `PolicyPackApprovalRequirement` shape |
| `costa-rica-export-requirements.ts` | `COSTA_RICA_EXPORT_REQUIREMENTS` and `createCostaRicaExportMetadata` (delegates to the shared `createJurisdictionExportMetadata`) |
| `costa-rica-control-plane.ts` | `COSTA_RICA_CONTROL_PLANE_SAFE_LABELS` and `createCostaRicaControlPlaneSummary` (delegates to the shared `createJurisdictionControlPlaneSummary`) |
| `costa-rica-base-pack.ts` | `createCostaRicaBaseJurisdictionPack` -- builds the manifest via `createPolicyPackManifest` and wraps it via the Jurisdiction Pack Runtime's `fromPolicyPackManifest` |
| `costa-rica-resolution.ts` | `resolveCostaRicaJurisdictionAction` -- delegates pack presence/status gating to `resolveJurisdictionPacks`/`composePolicyPacks`; only adds jurisdiction-ambiguity/conflict and review-trigger signals on top, using the existing `PolicyPackCompositionDecision` vocabulary |
| `costa-rica-fixtures.ts` | Demo-only pack/registry fixtures, no real Costa Rican content |

## What this pack is not

It is not a Costa Rica compliance pack, a Costa Rica legal engine, a Costa Rica law resolver, a Costa Rica regulatory compliance pack, a Costa Rica legal advice pack, or a Costa Rica legal validity pack.

It does not encode: Costa Rican statutes, legal articles, civil code rules, commercial code rules, labor code rules, tax code rules, criminal code rules, banking regulations, healthcare regulations, consumer law rules, privacy law interpretation, public procurement rules, e-signature law interpretation, sports event law, payment settlement law, or smart contract validity.

It performs no legal source ingestion, PDF parsing, OCR, network calls, web lookup, or LLM legal interpretation.

## Dependency on the global legal baseline

This pack declares `requiredPackIds: ['aoc.global_legal_baseline.v1']` (matching the id `policy-pack-foundation`'s `buildGlobalBaselineManifestFixture` and `domain-policy-pack-runtime`'s `GLOBAL_LEGAL_BASELINE_POLICY_PACK_ID` both already use). Composing this pack without that baseline manifest available fails closed (`composed: false`, `missingPackIds` includes the baseline id, `decision` escalates) rather than silently proceeding -- see `costa-rica-composition.test.ts`.

## Review triggers, evidence, and approvals are operational signals, not legal conclusions

`COSTA_RICA_REVIEW_TRIGGERS` are trigger *categories* (e.g. "party located in Costa Rica", "payment flow touching Costa Rica") that recommend a review path -- they never assert that a specific Costa Rican law applies or has been satisfied. `COSTA_RICA_EVIDENCE_REQUIREMENTS` and `COSTA_RICA_APPROVAL_REQUIREMENTS` are catalog entries with `required: false`: whether a given evidence/approval type is actually required for a specific action is decided by which review triggers fire for that action (`evaluateCostaRicaReviewTriggers`), not by unconditional manifest declaration -- this pack existing must never itself force every action into review or auto-approve anything.

## Future extension path

Future packs may extend this baseline with customer-provided or counsel-reviewed Costa Rica-specific policy material.

Such future packs must preserve:

- not legal advice
- not compliance certification
- no completeness claim
- no jurisdictional compliance claim unless independently validated and explicitly source-provided
- required counsel/customer validation metadata

## Determinism

No network calls, no LLM calls, no OCR/PDF parsing, no `Math.random()`, no `Date.now()`/argless `new Date()`. See `tests/costa-rica-determinism.test.ts`.
