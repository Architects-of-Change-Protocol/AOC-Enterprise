# Assurance Store Migration v1 (PR-007)

## Existing Assurance data sources

The preliminary audit (`AOC_ASSURANCE_CURRENT_MODEL.md`) found **no existing
Assurance data to migrate**: no assessment tables, no stored scores, no
findings, no public matrix rows, no manually curated company assessments.
The only adjacent data are:

| Source | Contents | Canonical? | Treatment |
| --- | --- | --- | --- |
| `apps/agent-passport-web` SQLite (24 tables: passports, registries, exports, billing…) | Commercial passport product data incl. `registry_export_artifacts` (self-reported report blobs with their own "not a certified compliance attestation" disclaimers) and a stored `governanceLevel` string | Canonical for that product only | **Remains legacy, outside the Assurance Store.** Its reports are manually curated/self-reported artifacts and must never be presented as evidence-derived runtime assessments |
| `packages/agent-governance` `governanceLevel` (hardcoded `'constitutional'` at issuance) | A manual/product label, not a derived score | No | Not imported. If a future product wants runtime-backed levels, it consumes published `AssuranceReport`s |
| `packages/runtime-negotiation` trust arithmetic | Ungoverned constants | No | Not imported |
| Governance Store / Evidence Store / Passport Store | Real governed history | Canonical in their own stores | **Consumed by reference at assessment time** — never copied into the Assurance Store |

## Which fields are canonical

Inside the new Assurance Store the canonical record is the assessment
aggregate (`assessment_json`) plus append-only finding events, manual
reviews, and signals. The normalized child tables (evidence references,
control evaluations, domain assessments, scores, eligibility) are
write-once queryable projections of the terminal aggregate — reconstructable,
never a second source of truth.

## Manual vs. derived scores

Every score the Assurance Store will ever hold is **derived** (framework
scoring model over deterministic control evaluations, with calculation
traces). No manual scores exist anywhere in the repository to import, and
none may be inserted: there is no write path that accepts a score without
its evaluations.

## What may be imported later (and how it must be labeled)

If historical, manually curated assessments are ever imported (e.g. from a
future public product):

- they must be stored with provenance identifying the manual origin
  (`sourceSystem`), a distinct framework id (never `aoc.saf`), and
  `control_attestation`-type evidence only;
- they must never be presented as evidence-derived runtime assessments;
- **missing evidence must not be fabricated** — a historical claim without
  evidence imports as `unknown` controls and an evidence-gap finding, or it
  does not import at all. An imported record that cannot satisfy the
  Assurance Equation is legacy documentation, not an assessment.

## Schema migration mechanics

`assurance_store_versions` records the schema version
(`aoc.assurance-store.schema.v1`) and migration state on first open. v1
creates the full schema idempotently (`CREATE TABLE IF NOT EXISTS`); future
schema versions must append migrations keyed off the recorded version, never
mutate v1 rows. Both store implementations pass one shared contract suite
(`assurance-store-contract.test.ts`), including persistence across
close/reopen and completed-assessment immutability.

## What history is missing (stated honestly)

Because no Assurance runtime existed before PR-007, there is no historical
assessment record for any subject. The first runtime assessment of a subject
starts its history; nothing is backfilled, and `ContinuousAssuranceState`
reports `unknown` for subjects never assessed.
