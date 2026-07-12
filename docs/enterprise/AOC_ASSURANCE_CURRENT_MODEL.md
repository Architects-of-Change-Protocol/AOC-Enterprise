# AOC Assurance — Current Model (Preliminary Analysis, PR-007)

This document is the mandatory preliminary analysis for the Assurance Runtime
(PR-007): a reconstruction of everything Assurance-related that existed in
this repository **before** `src/enterprise/assurance/` was implemented, so the
new runtime is grounded in repository evidence rather than invention.

## Headline finding

**No standalone SAF documents exist in this repository.** There are no files
named SAF-001, SAF-002, or SAF-003, no document titled "Sovereignty Assurance
Framework", no public Assurance matrix, no company assessments, no Assurance
landing pages, no scoring engine, no findings model, no assessment database
tables, and no certification-issuing code. What exists instead is a set of
deliberate, well-documented **reserved forward-references to a future
Assurance Runtime**, several **conceptually adjacent primitives**, and a
strong **claim-safety / no-overclaim discipline**. The runtime framework
(`aoc.saf` 1.0.0) is therefore translated from these repository-real sources,
and every mapping is documented in `AOC_SAF_V1_RUNTIME_MAPPING.md`.

## Asset audit

| Existing Assurance Asset | Current Location | Current Role | Runtime-Reusable | Risks | Recommended Treatment |
| --- | --- | --- | --- | --- | --- |
| Reserved `assurance_record` reference type | `src/enterprise/governance-store/contracts.ts` (`GovernanceReferenceRecord.referenceType`), `governance-store.ts` `appendReference()` | Production-real, documented as "the referenced runtimes do not exist yet" | **Yes** — the designed attachment point from Governance Records to Assurance artifacts | None; zero schema change required | Reuse as-is; never redefine |
| Reserved `assurance` evidence reference type | `src/enterprise/evidence/contracts.ts` (`EvidenceReferenceType`) | Production-real forward-reference ("structure only") | **Yes** | None | Reuse as-is |
| "Only a future Assurance Runtime could earn the right…" doctrine | `src/enterprise/passport/contracts.ts` (claims/history-summary docs), `AOC_AGENT_PASSPORT_MODEL.md` ("No trustScore field exists, and none may be added without a governed, documented, explainable methodology") | Production-real design constraint | **Yes** — it defines what this PR must deliver: governed, documented, explainable methodology | Ignoring it would recreate the arbitrary-trust-score problem | Honour it: framework-bound scores, calculation traces, no universal trust score |
| Governance level ladder (`registered → constitutional → observed → governed → enforced → certified`) | `packages/agent-governance/src/passport/governance-level.ts`, `passport-issuance.ts` | Partial: the type exists, but issuance **hardcodes** `'constitutional'`; no engine assigns levels; `'certified'` is publicly disclosable yet unearned | **Conceptually** — the ladder is the closest existing "assurance level" concept | The `'certified'` enum member is public-facing wording with no implementation behind it (overclaim risk) | Keep outside Enterprise Runtime; treat as conceptual source for eligibility profiles; do not consume its wording ("certified") for runtime profiles |
| Negotiation trust arithmetic (`trustDelta`, `degradationRisk`, `trustCompatible`) | `packages/runtime-negotiation/negotiation-trust.ts`, `negotiation-attestation.ts` | Beta/partial: real numeric comparator with ungoverned magic numbers (40, `*10`); only test is `.skip` | **No** for scoring (opaque constants are exactly what PR-007 prohibits); the attestation ref-chain shape is conceptually adjacent | Surfacing `trustDelta` externally would be an unexplained score | Leave untouched, outside Enterprise Runtime |
| Evidence-source runtime primitives (`EvidenceRequirement`, `EvidenceArtifact`, `EvidenceSatisfaction`, `EvidenceReview`, `classifyEvidenceRisk`) | `src/features/evidence-source-runtime/domain/` | Production-real; `classifyEvidenceRisk` derives `none…critical` purely from missing/rejected/expired/stale counts and explicitly disclaims legal/business meaning | **Conceptually** — the requirement → evidence → review → risk pipeline prefigures the Assurance evidence model | Feature-layer code; importing it into `src/enterprise` would cross the features boundary | Treat as conceptual source; Enterprise Assurance defines its own bounded contracts |
| Claim-safety / no-overclaim rules | `src/features/policy-pack-foundation/manifest/policy-pack-manifest-constants.ts` (`POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES` incl. "certified compliant", "guaranteed compliant", "GDPR compliant"; `POLICY_PACK_SAFE_LABELS` incl. `not_compliance_certification`, `requires_customer_validation`), `policy-pack-claim-safety.ts`, `src/features/aoc-enterprise-demo/**/pmfreak-claim-safety.ts` | Production-real, heavily tested, deterministic ("never calls a network or a language model") | **Yes as governing constraint** | None | The Assurance Runtime's wording discipline (eligibility ≠ certification, neutral profile names, explicit Known Limitations) is designed to satisfy these scanners |
| Registry export reports (standing, coverage tables, disclaimers) | `apps/agent-passport-web/src/lib/registry-export-service.ts` | Production-real commercial reporting with honest disclaimers ("This export does not constitute a certified compliance attestation", "self-reported…") | **Conceptually** — a template for honest report projection | Its `registry_evidence_bundle_json` naming collides with the cryptographic `EvidenceBundle` | Keep outside Enterprise Runtime; preserve compatibility (untouched by PR-007); later it may *consume* published Assurance Reports, never own the control engine |
| `packages/enterprise-audit` | `packages/enterprise-audit/src/contracts.ts` | Types-only audit routing contracts (siem/data-lake/event-bus/sovereign-store); no implementation | No (different concern: audit event routing) | None | Leave untouched |
| `packages/audit-sdk`, `apps/audit-console`, `apps/dashboard` | `.gitkeep` placeholders only | Scaffolding/documentation-only | No | Their names suggest capabilities that do not exist | Leave untouched |
| `src/runtime/` audit/attestation modules | `src/runtime/audit/`, `src/runtime/federation/`, `src/runtime/vault/` | Production-real runtime-layer audit emission and isolation attestations | No (fixed dependency surface; PR-007 must not change `src/runtime/`) | None | Leave untouched (verified unchanged) |

## Classification summary

- **Production-real**: Governance Store reserved references, Evidence reserved
  references, Passport no-trust-score doctrine, claim-safety scanners,
  registry export reports, evidence-source-runtime primitives.
- **Beta-real / partial**: `runtime-negotiation` trust comparator (skipped
  tests, ungoverned constants); `agent-governance` governance levels (type
  exists, assignment hardcoded).
- **Scaffolding / documentation-only**: `audit-sdk`, `audit-console`,
  `dashboard`, `enterprise-audit` (types only).
- **Public claims that exceed implementation** (flagged for honesty):
  1. `AgentGovernanceLevel = '…certified'` is publicly disclosable but no
     engine ever assigns it (issuance hardcodes `'constitutional'`).
  2. `registry_evidence_bundle_json` names a self-reported rollup an
     "evidence bundle", colliding with the cryptographic `EvidenceBundle`
     (mitigated by its own disclaimers).
  3. `trustDelta`/`trustCompatible` thresholds are unexplained constants and
     must never be surfaced as an assurance score.

## Concept mapping (existing SAF concept → canonical runtime concept)

| Existing SAF Concept (repository source) | Runtime Concept |
| --- | --- |
| Assurance domain (implied by PR-001..006 capability areas: governance, evidence, identity, operations) | `AssuranceDomainDefinition` |
| Control (implied by capability invariants: "records persist", "digests verify", "revocation enforced", "readiness reported") | `AssuranceControlDefinition` |
| Evidence requirement (`EvidenceRequirement` in evidence-source-runtime; "verified evidence" doctrine) | `AssuranceEvidenceRequirement` |
| Evidence artifact / satisfaction (`EvidenceArtifact`, `EvidenceSatisfaction`) | `AssuranceEvidenceReference` + `AssuranceEvidenceResolution` |
| Evidence review (`EvidenceReview`) | `AssuranceManualReviewRecord` |
| Evidence risk classification (`classifyEvidenceRisk`) | `AssuranceFinding` (typed `evidence_gap`) + evidence rejection reason codes |
| Finding (no prior model existed) | `AssuranceFinding` + append-only `AssuranceFindingEvent` |
| Score (no prior engine; "no arbitrary trust score" doctrine) | `AssuranceScore` — framework-bound, trace-carrying |
| Constitutional/Sovereignty/Governance "score" (never implemented) | `AssuranceDomainAssessment.normalizedScore` under `aoc.saf.scoring` |
| Certification threshold (the unearned `'certified'` ladder rung) | `AssuranceEligibilityProfile` with neutral names (`baseline`/`advanced`/`continuous`) — deliberately **not** "certified" |
| Certification wording (prohibited by claim-safety) | `AssuranceEligibilityResult`/`AssuranceEligibilityCandidate` — eligibility, never certification |
| Public matrix / company assessments (do not exist) | Out of scope; a future public product may consume `AssuranceReport` projections |

**Existing public scoring and Enterprise runtime scoring are not
interchangeable**: no existing public scoring exists to migrate, and the
`agent-governance`/`runtime-negotiation` numeric artifacts are explicitly not
imported into the runtime (see `ASSURANCE_STORE_MIGRATION_V1.md`).

## What existed vs. what PR-007 adds

Existing (preserved unchanged): Kernel decisions, Governance Records,
Evidence Bundles, Agent Passports, module lifecycle/health, reserved
references, claim-safety scanners, all public packages/apps.

Added by PR-007 (all previously absent): versioned framework registry and
model, evidence requirements/resolver with rejection reason codes,
deterministic control evaluator with six statuses, findings engine with
append-only lifecycle, domain assessments and transparent scoring with
calculation traces, eligibility profiles/results, immutable assessments with
integrity digests, continuous signals with derived staleness, independent
in-memory + SQLite Assurance Store, verification, canonical JSON reports with
disclosure views, `aoc.enterprise.assurance` module, HTTP APIs, telemetry,
events, and documentation.

## Files expected to change (and changed)

- New package `src/enterprise/assurance/**`.
- Enterprise integration: `composition/composition-root.ts`,
  `modules/assurance-module.ts`, `adapters/node-http-adapter.ts`,
  `api/assurance-contract.ts`, `api/enterprise-http-errors.ts`,
  `events/enterprise-events.ts`, `telemetry/enterprise-telemetry.ts`,
  `telemetry/enterprise-logger.ts` (closed log-field set extended),
  `configuration/enterprise-configuration.ts`, `index.ts`.
- Tests under `src/enterprise/__tests__/assurance-*.test.ts` plus the
  built-in-module-list characterization in
  `module-lifecycle-integration.test.ts`.
- Unchanged by design: `src/kernel/`, `src/runtime/`, all Governance
  Store/Evidence/Passport sources, all `packages/*`, all `apps/*`.
