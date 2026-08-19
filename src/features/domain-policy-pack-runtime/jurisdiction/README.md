# Soberanía Jurisdiction Pack Runtime v1 (Policy Pack Foundation-aligned)

Soberanía Jurisdiction Pack Runtime is aligned with Soberanía Policy Pack Foundation v1.

It consumes:

- `PolicyPackManifest` -- every `JurisdictionPack` carries its manifest
  directly (`JurisdictionPack.manifest`); there is no separate jurisdiction
  manifest standard.
- `PolicyPackValidationStatus` -- `JurisdictionValidationStatus` is a narrow
  `Extract<>` of it, and satisfaction between two statuses is always decided
  by the shared `satisfiesPolicyPackValidationStatus`, never by a second
  trust lattice.
- `PolicyPackSafeFraming` -- jurisdiction packs derive their safe framing from
  `createPolicyPackManifest`, which forces `noJurisdictionalComplianceClaim`
  (and the other four core safe-framing guarantees) to `true`.
- the universal no-overclaim harness -- `assertNoJurisdictionOverclaim` and
  `evaluateJurisdictionClaimSafety` are thin wrappers over
  `assertNoPolicyPackOverclaim` / `evaluatePolicyPackClaimSafety`.
- generic pack composition -- `composeJurisdictionWithBaseline` and
  `resolveJurisdictionPacks` both call `composePolicyPacks` rather than
  re-implementing dependency resolution or decision priority.
- shared approval/evidence/export/Control-Plane reference adapters --
  `mapJurisdictionResolutionToApproval`, `mapJurisdictionResolutionToEvidenceRequirements`,
  `createJurisdictionExportMetadata`, and `createJurisdictionControlPlaneSummary`
  all call into `policy-pack-foundation`'s adapters instead of producing their
  own reference records.

**This runtime does not encode jurisdiction-specific law.** It does not
implement Costa Rica, Panama, US, EU, Delaware, California, or any other real
jurisdiction's requirements.

**This runtime does not provide legal advice.**

**This runtime does not certify compliance with any jurisdiction.**

**This runtime does not replace counsel.**

**This runtime does not claim completeness.**

**This runtime prepares infrastructure for future jurisdiction-specific
packs**, which remain separate, later PRs built on top of it -- not part of
this module.

## Available jurisdiction packs

- `aoc.jurisdiction.costa_rica.base.v1` -- Soberanía Jurisdiction Costa Rica Base
  Pack v1 (see `packs/costa-rica/README.md`). A **demo/system-authored
  baseline**: not legal advice, not a compliance certification, and not
  counsel-reviewed by default. It provides Costa Rica jurisdiction context,
  review triggers, evidence/approval requirements, and safe export/Control
  Plane metadata -- it does not encode Costa Rican law and does not certify
  Costa Rica compliance.

## What this module is

A jurisdiction-shaped specialization layer over `policy-pack-foundation`:

| File | Specializes |
| --- | --- |
| `jurisdiction-pack-types.ts` | `JurisdictionPack`, `JurisdictionDescriptor`, `JurisdictionValidationStatus` (a narrow `Extract<PolicyPackValidationStatus>`), `JurisdictionEvidenceRequirement` / `JurisdictionReviewRequirement` (both extend the shared `PolicyPack*Requirement` shapes) |
| `jurisdiction-pack-factory.ts` | `createJurisdictionPack` (builds via `createPolicyPackManifest`), `toPolicyPackManifest`, `fromPolicyPackManifest` |
| `jurisdiction-pack-validator.ts` | `validateJurisdictionPack` (delegates to `validatePolicyPackManifest`, adds only jurisdiction-shape checks) |
| `jurisdiction-pack-claim-safety.ts` | `assertNoJurisdictionOverclaim` / `evaluateJurisdictionClaimSafety` (thin wrappers) |
| `jurisdiction-pack-registry.ts` | `createJurisdictionPackRegistry` (in-memory, deterministic) |
| `jurisdiction-pack-resolver.ts` | `resolveJurisdictionPacks` (calls `composePolicyPacks` per pack) |
| `jurisdiction-pack-composer.ts` | `composeJurisdictionWithBaseline` (calls `composePolicyPacks`) |
| `jurisdiction-pack-approval.ts` / `jurisdiction-pack-evidence.ts` | `mapJurisdictionResolutionToApproval` / `mapJurisdictionResolutionToEvidenceRequirements` (call the shared adapters) |
| `jurisdiction-pack-export.ts` | `createJurisdictionExportMetadata` (calls the shared export adapter; result is scanned with `assertNoPolicyPackOverclaim`) |
| `jurisdiction-pack-control-plane.ts` | `createJurisdictionControlPlaneSummary` (calls the shared Control Plane adapter; result is scanned with `assertNoPolicyPackOverclaim`) |
| `jurisdiction-pack-fixtures.ts` | Demo-only, generic-shaped jurisdiction pack fixtures -- no real jurisdiction content |

It never re-implements a manifest standard, a validation-status lattice, a
safe-framing shape, an overclaim scanner, or a dependency resolver. Every one
of those concerns is delegated to `policy-pack-foundation`.

## Migration notes (from the pre-alignment design)

An earlier iteration of this runtime was sketched as a fully self-contained
module, before `policy-pack-foundation` existed as a real, mergeable
Foundation layer. This module supersedes that design outright -- it was
never merged, so there is no parallel standard to delete, only a direction to
avoid recreating:

| Old (self-contained) | New (Foundation-aligned) |
| --- | --- |
| A standalone `JurisdictionValidationStatus` trust lattice | `JurisdictionValidationStatus` is `Extract<PolicyPackValidationStatus, ...>`; satisfaction always goes through `satisfiesPolicyPackValidationStatus` |
| `assertNoJurisdictionOverclaim` backed by its own `JURISDICTION_PROHIBITED_OVERCLAIM_PHRASES` scanner | `assertNoJurisdictionOverclaim` is a one-line wrapper over `assertNoPolicyPackOverclaim` |
| A custom jurisdiction-safe metadata shape (`requiredDisclaimer`, `policyModelStatus`, `complianceClaimed`, ...) | `PolicyPackSafeFraming`, produced by `createPolicyPackManifest` |
| A custom `composeJurisdictionWithBaseline` dependency walker | `composeJurisdictionWithBaseline` calls `composePolicyPacks` |
| Ad hoc evidence/approval/export/Control-Plane record shapes | `PolicyPackEvidenceRequirement` / `PolicyPackApprovalRequirement` / `PolicyPackExportRequirement` / `PolicyPackControlPlaneRequirement`, mapped through `policy-pack-foundation`'s adapters |

## Determinism

No network calls, no LLM calls, no OCR/PDF parsing, no `Math.random()`, no
`Date.now()`/argless `new Date()`. See
`tests/jurisdiction-pack-runtime-determinism.test.ts`.
