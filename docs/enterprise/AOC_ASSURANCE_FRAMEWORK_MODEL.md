# Assurance Framework Model (PR-007)

An `AssuranceFramework` (`src/enterprise/assurance/contracts.ts`) is a pure
data definition: identity (`frameworkId` + `frameworkVersion`), status
(`draft | active | deprecated | retired`), domains, controls, evidence
requirements, one scoring model, and eligibility profiles. Frameworks never
carry executable code — no `eval`, no functions, no remote plugins
(mission section 76).

## Versioning and immutability

- `frameworkId`+`frameworkVersion` registers exactly once and is immutable
  after activation. Changed controls, weights, or thresholds require a NEW
  version.
- Framework versions are independent of `AOC_ASSURANCE_RUNTIME_VERSION`
  (package version) by design.
- `deprecated` versions remain readable and assessable (read continuity);
  `retired` versions remain readable/verifiable but are refused for new
  assessments unless explicitly configured (`allowRetiredFrameworks`).
- `draft` versions are refused for assessment until activated.

## Registry

`createAssuranceFrameworkRegistry()` — `register`, `get`, `list`,
`activate`, `deprecate`, `validate`, `freeze`. Registration happens at
Enterprise composition time (built-in `aoc.saf` 1.0.0 plus any
`CreateEnterpriseOptions.assuranceFrameworks`); the registry **freezes**
when the Assurance module initializes, so nothing registers after Enterprise
startup. Definitions are also persisted (system scope) into the Assurance
Store so stored assessments verify against their framework across restarts.

## Validation (`validateAssuranceFramework`)

Checks (mission section 47): unique framework id/version; at least one
domain; unique domain ids; domain weights > 0 summing to 1; valid
`minimumScore` ranges; unique control ids; controls bound to this
framework's id/version; valid domain references and ownership; valid
evidence-requirement references; positive control weights and maximum
scores; supported criteria types (recursively through composites); valid
composite minimums; valid evidence_presence bounds; blocking controls listed
in their own domain; no orphan controls; a complete 0..1 (or null) status
score map; valid domain/control weight overrides; valid eligibility profiles
(ranges, known domains/controls). An invalid required framework fails
Assurance module startup.

## Domains

`AssuranceDomainDefinition`: id, name, description, `controlIds`, `weight`
(share of the overall score; all domain weights sum to 1), optional
`minimumScore` (normalized 0..100 floor below which the domain is
`unhealthy`), optional `blockingControlIds` (failures override the numeric
average — see `AOC_ASSURANCE_SCORING.md`).

## The built-in framework

`aoc.saf` 1.0.0 (`saf-framework.ts`): 4 domains, 10 controls, 6 evidence
requirements, scoring methodology `aoc.saf.scoring@1.0.0`, 3 eligibility
profiles (`baseline`, `advanced`, `continuous`). Full inventory and source
mapping: `AOC_SAF_V1_RUNTIME_MAPPING.md`.
