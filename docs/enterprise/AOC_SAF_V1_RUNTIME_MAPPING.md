# AOC SAF v1 — Runtime Mapping (PR-007)

How the repository's Sovereignty Assurance Framework concepts became the
first runtime framework, `aoc.saf` version `1.0.0`
(`src/enterprise/assurance/saf-framework.ts`).

## Canonical-source disclosure

No standalone SAF-001/SAF-002/SAF-003 documents exist in this repository (see
`AOC_ASSURANCE_CURRENT_MODEL.md`). The canonical conceptual sources for the
runtime translation are the repository's *implemented*
sovereignty-assurance concepts, each named below. Nothing in `aoc.saf` 1.0.0
was invented solely from the PR-007 prompt: every domain and control is
grounded in a capability the platform actually provides and can produce
verifiable evidence for. Where the repository provided no source for a
commonly expected control (e.g. jurisdiction-specific legal controls), the
control was **omitted**, not fabricated.

## Source → domain mapping

| SAF source (repository evidence) | Runtime domain |
| --- | --- |
| PR-004 Governance Store: durable request/decision aggregates, SHA-256 integrity, reserved `assurance_record` references | `saf.governance-integrity` (weight 0.30) |
| PR-005 Evidence Bundle: `Truth ≠ Disclosure`, disclosure policies, bundle verification, reserved `assurance` references | `saf.evidence-disclosure` (weight 0.25) |
| PR-006 Agent Passport: organization-bound identity, append-only event chain, six-state lifecycle, no-arbitrary-trust-score; `packages/agent-governance` governance-level ladder (its upper rungs previously unearned by any engine) | `saf.agent-identity` (weight 0.25) |
| PR-003 Module Lifecycle: deterministic startup, readiness, module health; claim-safety `requires_customer_validation` (human review discipline) | `saf.operational-continuity` (weight 0.20) |

## Source → control mapping

| SAF source section/concept | Runtime control | Method | Criticality |
| --- | --- | --- | --- |
| "The Governance Store preserves what happened" (PR-004); governed actions must leave durable records | `saf.gov.records-present` | evidence_presence over `saf.req.governance-records` | mandatory |
| PR-004 integrity digests ("stored digest values are never trusted without recomputation") | `saf.gov.records-integrity` | boolean `governance.records.all_verified` | mandatory, **blocking** |
| PR-005 "an organization can prove a decision was made correctly without revealing everything it knows" | `saf.evidence.bundles-present` | evidence_presence over `saf.req.evidence-bundles` | recommended |
| PR-005 `verifyEvidenceBundle` (bundle digest, verification digest, policy match, completeness) | `saf.evidence.bundles-verified` | boolean `evidence.bundles.all_verified` | mandatory |
| PR-006 "a Passport is bound to exactly one trust domain"; agent-governance `registered` rung | `saf.identity.passport-bound` | evidence_presence over `saf.req.agent-passport` | mandatory; applicability: agent/passport subjects |
| PR-006 event-chain digests / `verifyAgentPassport` | `saf.identity.passport-integrity` | boolean `passport.verified` | mandatory, **blocking** |
| PR-006 lifecycle state machine ("terminal statuses never accept a further transition") — the mission's own blocking-control example ("Passport revocation enforcement = fail → domain unhealthy") | `saf.identity.revocation-enforced` | boolean `passport.lifecycle_valid` | mandatory, **blocking** |
| PR-003 readiness ("can the Enterprise Host safely accept governance evaluations right now?") | `saf.ops.enterprise-ready` | boolean `enterprise.ready` | mandatory |
| PR-003 module health aggregation | `saf.ops.modules-healthy` | threshold `modules.unhealthy_count == 0` | recommended |
| Claim-safety `requires_customer_validation` / `not_compliance_certification`: automated evidence alone must not certify operations | `saf.ops.independent-review` | manual_review (role `assurance-reviewer`) | recommended |

## Source → evidence requirement mapping

| Source | Requirement | Accepted types | Key constraints |
| --- | --- | --- | --- |
| PR-004 Governance Records | `saf.req.governance-records` | `governance_record` | must be verified, organization-bound; contradiction → manual_review |
| PR-005 Evidence Bundles | `saf.req.evidence-bundles` | `evidence_bundle` | must be verified, organization-bound; contradiction → manual_review |
| PR-006 Agent Passports | `saf.req.agent-passport` | `agent_passport` | must reference the subject, organization-bound; contradiction → **fail** (two passport states for one agent is an integrity event) |
| PR-003 Enterprise health | `saf.req.enterprise-health` | `enterprise_health` | contradiction → unknown |
| PR-003 module health | `saf.req.module-health` | `module_health` | contradiction → unknown |
| Claim-safety human-review discipline | `saf.req.review-attestation` | `control_attestation` | manual evidence allowed (attributable reviewer attestations) |

## Source → scoring mapping

| Source | Runtime decision |
| --- | --- |
| Mission section 28 example mapping, unmodified by any repository source | `pass → 1.00`, `partial → 0.50`, `fail → 0.00` |
| Claim-safety discipline: missing evidence must not be hidden | `unknownPolicy: 'zero'` — unknown stays visible **and** costly (scored 0, never removed from the denominator) |
| Manual review must not silently block or silently pass | `manualReviewPolicy: 'provisional'` — pending review excludes the control from the denominator and marks any eligibility provisional |
| "Do not let numerical averages conceal blocking failures" | `blockingRule: 'both'` — blocking failures override the domain status AND block eligibility |
| No repository source justified per-control weight differences in v1 | uniform control weights (1) inside each domain; domain weights 0.30/0.25/0.25/0.20 reflect the dependency order of the capability stack (decisions → proof → identity → operations) |

## Source → eligibility mapping

The `agent-governance` ladder (`registered → constitutional → observed →
governed → enforced → certified`) is the only pre-existing "level" concept.
Its `'certified'` rung is prohibited wording under the repository's own
claim-safety rules (`'certified compliant'` is a prohibited overclaim
phrase), and PR-007's mandate says internal profiles must not be called
certifications. The runtime therefore uses the mission's neutral names:

| Ladder concept (source) | Runtime profile | Thresholds |
| --- | --- | --- |
| registered/constitutional (recognized, governed decisions exist) | `baseline` | score ≥ 60; `records-present` + `records-integrity` mandatory; no open critical findings |
| observed/governed (proof exists and verifies) | `advanced` | score ≥ 80; governance ≥ 75, evidence ≥ 70; bundles verified mandatory; verified-evidence rate ≥ 0.8; no open high/critical |
| enforced (+ human review; never "certified") | `continuous` | score ≥ 85; +operations ≥ 70; evidence ≤ 90 days old; **manual review required** |

## What was deliberately NOT translated

- `runtime-negotiation` `trustDelta` constants — ungoverned magic numbers.
- The `'certified'` label — prohibited wording; eligibility ≠ certification.
- Jurisdiction/legal controls — no repository source; legal interpretation is
  an explicit non-goal.
- Public matrix scores — none exist; nothing was imported or fabricated.

## Versioning

`aoc.saf` 1.0.0 is immutable once registered active. Every future change to
its domains, controls, weights, thresholds, or profiles requires `aoc.saf`
1.1.0+ and a new mapping section in this document.
