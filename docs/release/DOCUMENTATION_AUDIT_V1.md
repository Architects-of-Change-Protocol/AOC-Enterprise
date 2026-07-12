# Documentation Reconciliation Audit — v1 (2026-07-12)

Pre-release audit reconciling every document under `docs/` plus the root
`README.md` against the code as it stands on this branch. Companion to
`docs/enterprise/MIGRATION_REVIEW_V1.md` (which covers the three SQLite
stores and was spot-checked, not re-audited, here).

Verification method: every `npm run` target, `scripts/*.mjs` path,
`@aoc-enterprise/*` package name, export-map subpath, `AOC_*`/`PASSPORT_*`
environment variable, HTTP endpoint, and repo file path quoted in the docs
was mechanically extracted and checked against `package.json`,
`src/enterprise/adapters/node-http-adapter.ts`,
`src/enterprise/configuration/enterprise-configuration.ts`, and the
filesystem.

## Scope

- **72 files checked**: 71 Markdown files under `docs/` (architecture 27,
  enterprise 29, kernel 4, operations 3, runtime 1, sdk 2, governance 1)
  plus the root `README.md`. (This audit file and `docs/release/` itself
  are excluded from the count.)
- Cross-checked code surfaces: root and workspace `package.json` scripts
  and `exports`; `scripts/` directory; `tests/` directory; HTTP routing in
  `src/enterprise/adapters/node-http-adapter.ts`; env-var reads across
  `src/`, `scripts/`, `packages/`, `apps/`;
  `packages/canonical-runtime-contracts/src/version.ts`;
  `.github/workflows/` (ci.yml, publishability.yml).

## Contradictions found

1. **How the root test suite runs** — `docs/enterprise/AOC_ENTERPRISE_HOST.md`
   ("Test Results" section): *"`npm test` (the repo-root script,
   `npm run build && node --test` with no scoping) … it discovers **every**
   package's `.ts` test sources directly … (354 pre-existing failures)"*.
   What code says: the root script in `package.json` is now
   `npm run build && node --test "dist/src/**/*.test.js" "tests/**/*.test.mjs" && npm test --workspaces --if-present`
   — scoped to compiled `dist/src` tests plus root `tests/*.test.mjs`, then
   per-workspace suites (`test:root` / `test:workspaces` also exist). The
   unscoped-discovery failure mode the doc describes no longer exists.
   *(Clarifying note added in place; see Fixes applied #4.)*

2. **Stable SDK entrypoint lists** — `docs/sdk/runtime-consumption.md` and
   `docs/sdk/versioning-and-stability.md` both list exactly five supported
   entrypoints (root, `/authorization`, `/audit`, `/crypto`, `/adapters`).
   What code says: `package.json` `exports` also declares `./runtime`,
   `./runtime-host`, `./kernel`, `./enterprise`, and `./kernel-host`, and
   `docs/enterprise/AOC_ENTERPRISE_HOST.md` /
   `KERNEL_HOST_TO_ENTERPRISE_MIGRATION.md` document them as public.
   *(Notes added in place; see Fixes applied #5–6.)*

3. **"Install from npm" vs. unpublished package** —
   `docs/sdk/runtime-consumption.md`: *"Install from npm:
   `npm install @aoc-enterprise/runtime`"*. What code says: root
   `package.json` has `"private": true`, and
   `docs/enterprise/KERNEL_HOST_TO_ENTERPRISE_MIGRATION.md` states
   *"`package.json` is `"private": true`, unpublished"*. Doc-vs-doc and
   doc-vs-code conflict. Left unfixed (publishing appears intended —
   `validate:publishability` and `publishability.yml` exist); resolve at
   release time by either publishing or rewording to tarball install.

4. **"No vertical-app logic" rule vs. PMFreak packages** —
   `docs/architecture/workspace-architecture.md`: *"Do not embed
   vertical-app (e.g. PMFreak) logic in this repository."* What code says:
   the workspace contains `packages/pmfreak-agent-passport-foundation/`
   and `src/` defines `AOC_PMFREAK_GOVERNANCE_*` /
   `AOC_PMFREAK_REMOTE_GOVERNANCE_*` constants. The same doc's topology
   also omits `apps/` (five apps) and `tests/`, both real workspace roots.
   Left unfixed — needs an owner decision (either the rule or the packages
   are wrong).

5. **Recommended monorepo layout vs. actual layout** —
   `docs/architecture/repo-boundaries.md` describes `packages/protocol/*`,
   `packages/enterprise/*`, `packages/apps/*`, `packages/shared/*`. What
   code says: packages are flat under `packages/*` with apps under
   `apps/*`, and protocol packages live in the separate
   `Architects_of_Change_Protocol` repo (consumed via
   `file:../Architects_of_Change_Protocol/packages/protocol`). Aspirational
   doc that was never realized — see Obsolete-doc candidates.

6. **v1.0.0 release naming vs. 0.1.0 package versions** — the release-track
   docs (`API_STABILITY_V1.md`, `MIGRATION_REVIEW_V1.md`,
   `DEPLOYMENT_GUIDE_V1.md`, `RUNBOOKS_V1.md`, `BACKUP_RECOVERY_V1.md`)
   freeze surface "for the v1.0.0 release", while root and every workspace
   `package.json` (and `CANONICAL_CONTRACTS_VERSION`) are `0.1.0`.
   Not a factual error yet — flagged so the version bump is not forgotten
   at release cut.

**Checked and found consistent (no contradiction):**

- **HTTP endpoint catalogs** in `API_STABILITY_V1.md`,
  `AOC_ENTERPRISE_HOST.md`, `AOC_ASSURANCE_RUNTIME.md`,
  `AOC_AGENT_PASSPORT_RUNTIME.md`, and the three operations docs all match
  `node-http-adapter.ts` exactly (health/live/ready; governance evaluate +
  four read routes; evidence build/verify/get; the eight assurance routes;
  passport create/reads and all nine POST actions including `views`).
- **Environment variable names**: every `AOC_ENTERPRISE_*`,
  `AOC_ENTERPRISE_PASSPORT_*`, `AOC_ENTERPRISE_ASSURANCE_*`, and
  `AOC_ENTERPRISE_STORE_*` variable quoted in docs exists in
  `enterprise-configuration.ts` (or the store factories); the
  `AOC_RUNTIME_*` -> `AOC_ENTERPRISE_*` rename table in
  `KERNEL_HOST_TO_ENTERPRISE_MIGRATION.md` correctly says the old names
  were removed outright — no `AOC_RUNTIME_*` env read remains in code.
- **npm scripts and scripts/*.mjs**: every `npm run` target and script
  path quoted anywhere in `docs/` exists in `package.json`/`scripts/`
  (including the `start:kernel-host` -> `start:enterprise` alias pair).
- **API_STABILITY_V1.md source-of-truth references**: all five
  `src/enterprise/api/*.ts` contract files, the four store `contracts.ts`
  files, `canonical-json.ts`, and `resolveGovernanceAccessContext` exist
  as described.
- `CANONICAL_CONTRACTS_VERSION = '0.1.0'` /
  `CANONICAL_CONTRACTS_SCHEMA_DATE = '2026-05-21'` quoted in
  `docs/runtime/contract-versioning-strategy.md` match the source.

## Stale references

References to files that do not exist at the quoted path:

1. `docs/kernel/AOC_KERNEL_INVARIANTS_V1.md` — cited
   `tests/recognition-runtime-integration.test.ts` (5×) and
   `tests/authority-graph-integration.test.ts` (1×). The root `tests/`
   directory contains only `*.test.mjs` host/contract tests; the cited
   suites live at `src/features/action-enforcement/tests/…` (confirmed by
   matching the doc's `execution_blocked` / enforcement-downgrade
   scenarios, which appear only in the action-enforcement copies).
   **Fixed.**
2. `docs/runtime/contract-versioning-strategy.md` — `src/version.ts`; the
   file is `packages/canonical-runtime-contracts/src/version.ts`
   (`src/` at repo root has no `version.ts`). **Fixed.**
3. `docs/enterprise/AOC_AGENT_PASSPORT_CURRENT_MODEL.md` —
   `docs/runtime-guard-lite.md`; the file is
   `packages/agent-governance/docs/runtime-guard-lite.md`. **Fixed.**
4. `docs/enterprise/AOC_ENTERPRISE_HOST.md` and
   `docs/architecture/ADR-ENTERPRISE-HOST-NAMING.md` reference
   `docs/runtime/ENTERPRISE_RUNTIME_HOST.md`, which no longer exists —
   acceptable as-is: both cite it explicitly as the superseded/renamed
   predecessor. Left unchanged.
5. `docs/enterprise/AOC_ENTERPRISE_CURRENT_PERSISTENCE_MODEL.md`
   references `src/enterprise/persistence/record-mappers.ts` and the
   pre-PR-004 store files — deleted/replaced by PR-004 exactly as the doc
   predicted. Expected staleness in an explicitly pre-PR-004 snapshot.
   Left unchanged (see Obsolete-doc candidates).
6. `docs/architecture/CURRENT_STATE_RUNTIME_FEDERATION.md` contains
   literal unexpanded `$(git rev-parse --abbrev-ref HEAD)` /
   `$(git rev-parse HEAD)` placeholders — the branch/commit metadata was
   never captured. Not repairable after the fact; cleanup candidate.
7. `docs/kernel/AOC_KERNEL_CURRENT_EXECUTION_MODEL.md` §18 abbreviates
   sibling test files as `tests/…` after a full
   `src/features/action-enforcement/tests/…` path in the same bullet —
   readable shorthand, all files exist; left unchanged.

## Fixes applied

All are single-line factual corrections (or single-line additive audit
notes where rewriting historical text would falsify a PR record):

1. `docs/runtime/contract-versioning-strategy.md` — `src/version.ts` ->
   `packages/canonical-runtime-contracts/src/version.ts`.
2. `docs/enterprise/AOC_AGENT_PASSPORT_CURRENT_MODEL.md` —
   `docs/runtime-guard-lite.md` ->
   `packages/agent-governance/docs/runtime-guard-lite.md`.
3. `docs/kernel/AOC_KERNEL_INVARIANTS_V1.md` — expanded the six bare
   `tests/…` citations to
   `src/features/action-enforcement/tests/…` (two distinct file names,
   verified unambiguous).
4. `docs/enterprise/AOC_ENTERPRISE_HOST.md` — added a one-line audit note
   ahead of the historical "Test Results" paragraph stating that the root
   `npm test` script is now scoped (`dist/src/**/*.test.js`,
   `tests/**/*.test.mjs`, per-workspace suites) and the described
   unscoped-discovery issue no longer applies.
5. `docs/sdk/runtime-consumption.md` — added a one-line note that the
   export map now also declares `/runtime`, `/runtime-host`, `/kernel`,
   `/enterprise`, `/kernel-host` (with `/kernel-host` transitional).
6. `docs/sdk/versioning-and-stability.md` — same one-line note as #5.

Not fixed (require owner decisions, not one-liners): Contradictions #3
(npm-install vs. private package), #4 (PMFreak rule vs. PMFreak packages),
#5 (aspirational repo layout), #6 (v1.0.0 vs. 0.1.0 version bump).

## Obsolete-doc candidates (post-v1 cleanup)

Historical working notes and pre-change baselines that no longer describe
the current system. Recommendation: move to a `docs/history/` folder (or
stamp a "historical baseline — superseded" banner) rather than delete,
since several are cited as PR evidence.

- `docs/architecture/CURRENT_STATE_RUNTIME_STABILIZATION.md`,
  `CURRENT_STATE_RUNTIME_OPERATIONAL_STATE.md`,
  `CURRENT_STATE_RUNTIME_PERSISTENCE_ABSTRACTION.md`,
  `CURRENT_STATE_RUNTIME_FEDERATION.md` (unexpanded shell placeholders),
  `CURRENT_STATE_SOVEREIGN_RUNTIME_VAULT_BOUNDARY.md` — per-change session
  notes with transient test logs ("npm test failed due to build failure")
  that read as current-state claims but are long stale.
- Pre-PR baseline snapshots (explicitly frozen "before" pictures):
  `docs/enterprise/AOC_ENTERPRISE_CURRENT_COMPOSITION_MODEL.md`
  (pre-PR-003), `AOC_ENTERPRISE_CURRENT_PERSISTENCE_MODEL.md`
  (pre-PR-004), `AOC_AGENT_PASSPORT_CURRENT_MODEL.md` (PR-006 prelim),
  `AOC_ASSURANCE_CURRENT_MODEL.md` (PR-007 prelim), and
  `docs/kernel/AOC_KERNEL_CURRENT_EXECUTION_MODEL.md` (pre-extraction).
- `docs/architecture/runtime-refactor-summary.md` and
  `runtime-release-stabilization.md` — one-shot PR summaries.
- `docs/architecture/repo-boundaries.md` — recommended layout never
  adopted (Contradiction #5); rewrite against the real workspace or
  retire in favor of `workspace-architecture.md`.
- `docs/enterprise/KERNEL_HOST_TO_ENTERPRISE_MIGRATION.md` — retire
  together with the `src/kernel-host/` shim, `./kernel-host` export, and
  `start:kernel-host` alias per the removal criteria the doc itself
  defines.
- Embedded "Test Results" sections inside otherwise-current docs
  (`AOC_ENTERPRISE_HOST.md` and similar) — PR-time snapshots; consider
  trimming to keep the docs evergreen.
- `docs/integrations/` and `docs/security/` contain only `.gitkeep` —
  either populate before release or remove the empty placeholders.

## Conclusion

The load-bearing v1 release documents — `API_STABILITY_V1.md`, the three
operations guides, the three store-migration docs plus
`MIGRATION_REVIEW_V1.md`, and the runtime/host reference docs — are
accurate against the code: endpoint catalogs, error codes, environment
variables, npm scripts, and source-file references all verified clean.
The defects found are concentrated in (a) historical snapshot docs that
present stale state as current, (b) the two SDK docs and one host section
that predate the kernel/enterprise entrypoint and test-script changes
(now annotated in place), and (c) three policy-level conflicts that need
an owner decision before release: publish-vs-private packaging, the
PMFreak vertical-app boundary rule, and the 0.1.0 -> 1.0.0 version bump.
Six safe in-place fixes were applied; no doc now points at a nonexistent
file except where it deliberately cites a superseded document. With the
obsolete-doc candidates relocated or banner-stamped and the three policy
conflicts resolved, the documentation set is reconciled for v1.
