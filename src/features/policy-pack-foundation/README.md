# AOC Policy Pack Foundation Alignment & Manifest Standard v1

The Domain Policy Pack Runtime answers "what does this domain, jurisdiction,
or customer require?" The Evidence / Source / Citation Runtime, Approval
Runtime, and Verifiable Export Package each answer a piece of "how is that
requirement backed and audited?" None of them answer the question that shows
up the moment AOC needs more than one kind of pack talking to each other:

**What is a policy pack, structurally -- regardless of whether it is a
global baseline, a legal baseline, a jurisdiction pack, a domain pack, a
use-case pack, a customer pack, a security pack, a privacy pack, or an
AI-governance pack -- and how do packs declare their dependencies, their
evidence/approval/export/Control-Plane needs, their trust level, and the
claims they are and are not allowed to make?**

That is this module's job. It is horizontal infrastructure: a shared
foundation every future policy pack builds on, not a policy pack itself.

## What this module is not

This module does not implement:

- any real jurisdiction's law (Costa Rica, Panama, the US, the EU, Delaware,
  California, or any other jurisdiction),
- sports-event payment settlement,
- smart-contract legal validity,
- legal advice, legal interpretation, or compliance certification,
- a full Approval Runtime, Evidence Runtime, Export Runtime, or Control
  Plane UI (those already exist elsewhere in this repo -- see
  [Foundation Runtime Alignment](#foundation-runtime-alignment) below for
  how this module references them without re-implementing or faking them).

It makes network calls to nothing, calls no LLM, and does no OCR/PDF
parsing. See `tests/policy-pack-foundation-determinism.test.ts`.

## The four pieces

### Foundation Runtime Alignment (`foundation/`)

`detectFoundationRuntimeCapabilities()` returns a static, hand-maintained,
deterministic list of `FoundationRuntimeIntegrationStatus` records -- one per
`FoundationRuntimeCapability` (Recognition Runtime, Authority Graph, Approval
Runtime, Evidence/Source/Citation Runtime, Verifiable Export Package,
Control Plane, Domain Policy Pack Runtime, Jurisdiction Pack Runtime, and
this module's own manifest/composition/validation capabilities). Each record
says whether that capability is:

| Availability | Meaning |
| --- | --- |
| `available` | A real, working module exists in this checkout. |
| `reference_only` | The capability exists conceptually but this Foundation layer only records references to it, never calls it. |
| `planned` | No module exists yet; a future PR is expected to add it. |
| `missing` | No module exists and nothing is planned. |
| `disabled` | A module exists but has been explicitly turned off. |

As of this PR, Recognition Runtime, Authority Graph, Approval Runtime,
Evidence/Source/Citation Runtime, Verifiable Export Package, Control Plane,
and Domain Policy Pack Runtime are all real, working modules elsewhere in
this repo (`src/features/*`) -- so they are marked `available`. Even so, the
adapters in this module (`adapters/`) never call into those real runtimes;
they only produce typed *reference* records (`ApprovalRuntimeReference`,
`EvidenceRuntimeReference`, `SourceRuntimeReference`,
`CitationRuntimeReference`, `ProofRuntimeReference`, `ExportRuntimeReference`,
`ControlPlaneReference`), each carrying a `*RuntimeRef` id and a status that
is always `reference_only` (or `not_available` if the underlying capability
is missing/disabled) -- because this module never actually invokes those
runtimes. Deep integration wiring is out of scope for this PR by design.

`Jurisdiction Pack Runtime` is marked `available`: `AOC Rebase / Align
Jurisdiction Pack Runtime with Policy Pack Foundation v1` added a real module
at `src/features/domain-policy-pack-runtime/jurisdiction` that specializes
this Foundation's manifest, validation-status, safe-framing, no-overclaim,
and composition standards for jurisdiction packs rather than duplicating
them -- see that module's README. It still implements no real jurisdiction's
law; a concrete jurisdiction pack (e.g. `aoc.jurisdiction.costa_rica.base.v1`)
remains a future, separate PR built on top of it.

`createFoundationRuntimeReferenceMap()` normalizes caller-supplied
references against the real capability statuses, clamping any reference that
claims more than a `missing`/`disabled`/`reference_only`/`planned` capability
actually supports down to `not_available`/`reference_only`.
`validateFoundationRuntimeReferences()` double-checks that normalization as
defense in depth, and `createFoundationRuntimeAlignmentReport()` produces a
single deterministic snapshot (`aligned` / `aligned_with_reference_only_integrations`
/ `missing_required_capabilities` / `blocked`) callers can inspect or export.

### Policy Pack Manifest Standard (`manifest/`)

`PolicyPackManifest` is the universal shape every AOC policy pack carries --
identity (`id`/`name`/`version`), classification (`kind`, `domain`, `scope`),
trust (`status: PolicyPackValidationStatus`, `sourceStatus`), safe framing
(`safeFraming`), dependencies (`extendsPackIds`/`requiredPackIds`/`optionalPackIds`),
and the requirements it places on Evidence, Approval, Export, and Control
Plane surfaces. `createPolicyPackManifest()` builds one, forcing the five
core safe-framing guarantees (`notLegalAdvice`, `notComplianceCertification`,
`noCompletenessClaim`, `noJurisdictionalComplianceClaim`,
`partialPolicyModel`) to `true` for every system-authored or demo pack --
even if the caller tries to turn them off. `validatePolicyPackManifest()`
checks structural completeness, safe-framing preservation, and claim safety.

**Domain label vs. compliance claim.** `PolicyPackDomain` values like
`'healthcare'`, `'finance'`, or `'jurisdiction'` are classification labels
only. `domain: 'healthcare'` does not mean HIPAA-compliant; `domain: 'finance'`
does not mean financial-regulation-compliant; `domain: 'jurisdiction'` does
not mean jurisdictionally compliant. Nothing in this module ever emits text
implying otherwise -- see the no-overclaim harness below.

### Policy Pack Composition Standard (`composition/`)

`composePolicyPacks()` resolves a requested pack against `extendsPackIds`
and `requiredPackIds` transitively (blocking) and `optionalPackIds`
separately (non-blocking), aggregates evidence/approval/export/Control-Plane
requirements uniquely across every included pack, combines safe framing
conservatively (a claim is only as safe as the *least* safe included pack),
and produces a deterministic `decision`. Decisions are chosen by a fixed
priority order:

```
deny > require_counsel_review > require_compliance_review >
require_domain_expert_review > require_customer_validation >
require_approval > require_review > hold > allow
```

A missing required pack holds composition open for review
(`require_review`); an expired or superseded required pack holds it
(`hold`); a disabled required pack denies it outright (`deny`); an unresolved
`requiredValidationStatus` requirement escalates to the matching review
decision. This module never evaluates rule *content* -- that remains Domain
Policy Pack Runtime's job.

### Shared validation status semantics (`validation/policy-pack-validation-status.ts`)

`satisfiesPolicyPackValidationStatus(actual, required)` is the single trust
lattice every pack kind shares. The rule that matters most: **a lower-trust
status can never satisfy a higher-trust requirement.** `demo_baseline`,
`system_baseline`, `customer_provided`, and `customer_validated` can never
satisfy `counsel_reviewed` or `counsel_attested`, no matter which module is
asking. `expired`, `superseded`, and `disabled` are terminal -- they satisfy
nothing except themselves.

### Universal no-overclaim / claim-safety harness (`validation/policy-pack-claim-safety.ts`, `validation/policy-pack-no-overclaim.ts`)

`evaluatePolicyPackClaimSafety(value)` stringifies and scans any value for
`POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES` (`"legally compliant"`,
`"GDPR compliant"`, `"fully secure"`, `"risk-free"`, `"unbiased AI"`,
`"guaranteed outcome"`, and more), after stripping known safe disclaimers
(`POLICY_PACK_SAFE_LABELS`, and negated mentions of the phrases themselves,
e.g. `"not GDPR compliant"` or `"does not claim to be fully secure"`) so
legitimate disclaimers never register as overclaims. `assertNoPolicyPackOverclaim(value)`
throws if any prohibited phrase survives that scan -- used across this
module's own tests on manifests, validation results, composition results,
foundation alignment reports, and every reference/adapter output.

This is deliberately domain-agnostic: the exact same failure mode --
inadvertently claiming `"HIPAA compliant"`, `"fully secure"`, or `"unbiased
AI"` -- applies to security packs, privacy packs, healthcare packs, finance
packs, and AI-governance packs, not just legal packs.

**Source-provided claims are labeled, never adopted as AOC's own
conclusion.** `evaluatePolicyPackClaimSafety(value, { allowedSourceProvidedClaims })`
lets a specific, explicitly-allowed phrase through, but always emits a
warning noting it is present as a source-provided claim -- AOC itself never
asserts compliance, security, or safety outcomes; at most it can pass through
a claim that a customer, counsel, or domain expert has explicitly and
narrowly provided, labeled as theirs.

## Key safety rule

> AOC must not emit compliance, legal, security, privacy, healthcare,
> finance, or AI-safety overclaims unless explicitly sourced and validated.
> Even then, AOC should label such claims as source-provided, not as AOC's
> own conclusion.

## Relationship to other modules

This module does not replace `domain-policy-pack-runtime`'s evaluation-time
`PolicyPack`/`PolicyPackVersion`/rule/condition/effect types -- those remain
the engine that evaluates whether a specific action is allowed. This module
adds a horizontal layer above and alongside it: a manifest standard,
composition model, validation-status lattice, and claim-safety harness any
current or future pack (legal, jurisdiction, domain, use-case, customer,
security, privacy, finance, healthcare, AI-governance, project-governance)
can adopt without every pack type reinventing the same safe-framing and
no-overclaim logic from scratch.

## What comes after this PR

This PR intentionally implements no real pack content. `domain-policy-pack-runtime`
already has a real `aoc.global_legal_baseline.v1` pack (see
`src/features/domain-policy-pack-runtime/packs/global-legal-baseline.policy-pack.ts`).
This foundation makes the following safe to build as separate, later PRs --
including migrating that existing global legal baseline pack onto the
`PolicyPackManifest` standard once it is ready to compose with other packs:

- `aoc.jurisdiction.costa_rica.base.v1`
- `aoc.domain.sports_events.v1`
- `aoc.usecase.sports_event_payment_settlement.cr.v1`
- `customer.event_operator_policy.v1`

Not before.
