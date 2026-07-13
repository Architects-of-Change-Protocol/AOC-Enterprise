# AOC Enterprise v1.0.0 — Release Candidate Summary (PR-008)

Hardening-only release: converts the existing AOC Enterprise runtime into a production-ready v1.0.0. No new products, no architecture changes, no new frameworks, no SAF/scoring/evidence-model changes, no new heavy dependencies, no AI in the runtime. Determinism, canonical JSON, SHA-256, append-only semantics, tenant isolation, and all public APIs are preserved exactly.

## Final release audit

| check | result |
|---|---|
| build (`npm run build`) | ✅ clean |
| typecheck (`npm run typecheck`) | ✅ clean |
| lint (node16-imports, architecture, public surface) | ✅ clean |
| tests (`npm test`) | ✅ ~3,700 tests, 0 failures (root dist suites + contract suites + 4 workspace suites) |
| full release gate (`npm run validate:release`; consolidated v1 gate: `npm run validate:v1-release`) | ✅ all checks green; `validate:publishability` validates the packed tarball against the `@aoc/protocol` sibling checkout (`../Architects_of_Change_Protocol`) when present, and otherwise falls back to the type-only stub at `tests/fixtures/protocol-stub` while independently asserting that no shipped artifact imports `@aoc/protocol` at runtime — the sibling checkout is no longer required |
| benchmarks executed | ✅ `docs/performance/BENCHMARK_BASELINE_V1.md` |
| load tests executed | ✅ `docs/performance/LOAD_TEST_V1.md` (authentication enabled; 0 errors/timeouts under 32-way load; 9-check correctness phase all green) |
| APIs documented & frozen | ✅ `docs/enterprise/API_STABILITY_V1.md` (27 endpoints, full error taxonomy, versioning policy) |
| stores versioned + migrations verified | ✅ `docs/enterprise/MIGRATION_REVIEW_V1.md`; all three stores refuse foreign schema versions |
| documentation reconciled | ✅ `docs/release/DOCUMENTATION_AUDIT_V1.md` (72 files audited; 6 safe fixes applied; obsolete docs flagged) |
| dependencies audited | ✅ `docs/release/DEPENDENCY_AUDIT_V1.md` (1 production dep; advisories isolated to a private demo app) |
| release reproducible | ✅ `npm ci` + lockfile v3 + `release/RELEASE_MANIFEST.json` checksums |
| threat model | ✅ `docs/security/THREAT_MODEL_V1.md` |
| security hardening report | ✅ `docs/security/SECURITY_HARDENING_V1.md` |
| runbooks | ✅ `docs/operations/RUNBOOKS_V1.md` (14 runbooks) |
| deployment guide | ✅ `docs/operations/DEPLOYMENT_GUIDE_V1.md` |
| backup & recovery documented | ✅ `docs/operations/BACKUP_RECOVERY_V1.md` (RPO/RTO stated) |
| minimal SDK functional | ✅ `packages/enterprise-host-sdk` (typed client, 0 dependencies, tested) |
| release manifest generated | ✅ `release/RELEASE_MANIFEST.json` via `scripts/generate-release-manifest.mjs` |
| changelog updated | ✅ `CHANGELOG.md` |
| version 1.0.0 prepared | ✅ root package `1.0.0`; runtime component versions frozen at 1.0.0 |

## Changed files and technical justification

### Runtime code (hardening only)

| file | change | justification |
|---|---|---|
| `src/enterprise/adapters/node-http-adapter.ts` | Fail-closed dispatch wrapper; `URIError` → 400; accurate route in error logs | Auth rejections and malformed percent-encoding previously escaped as uncaught exceptions (fail-open crash). Security Parts 1–2. |
| `src/enterprise/orchestration/credential-matching.ts` (new) | Constant-time API-key matching + shared bearer parsing | Removes timing side channel on the only secret comparison; deduplicates copied code. |
| `src/enterprise/orchestration/evaluate-governance-request.ts`, `governance-read-service.ts` | Use the shared matcher | Same. |
| `src/enterprise/passport/sqlite-passport-store.ts` | Schema-version guard; `SQLITE_CONSTRAINT` code detection; validated busy_timeout | A DB written under a foreign schema version was silently reused (fail-open); message-sniffing was fragile; pragma input unvalidated. |
| `src/enterprise/assurance/sqlite-assurance-store.ts` | Same three fixes + preserved error causes | Same. |
| `src/enterprise/governance-store/sqlite-governance-store.ts` | Validated busy_timeout; preserved error cause in generic transaction failures | Root-cause visibility for operators; consistency across stores. |
| `src/enterprise/__tests__/http-adapter-hardening.test.ts`, `sqlite-store-version-guard.test.ts` (new) | Regression coverage for every fix above | Hardening without pinned behavior regresses. |

### Test harness & build

| file | change | justification |
|---|---|---|
| `package.json` | Version 1.0.0; `engines.node >= 22`; scoped `test` script (+ `test:root`, `test:workspaces`) | Part 5: eliminates accidental discovery of raw `.ts` tests (413 structural failures → 0) without dropping any test; declares the supported platform. |
| `tsconfig.json` | Register `packages/enterprise-host-sdk` | New workspace participates in `tsc -b`. |
| `package-lock.json` | Lockfile refresh for the new workspace | Reproducibility. |
| deleted: `apps/agent-passport-web/dist-test/*` (4), `packages/canonical-runtime-contracts/tsconfig.tsbuildinfo` | Untracked committed build artifacts | Already gitignored; committed artifacts drift from source and pollute diffs. |

### Release gate fix

`scripts/check-runtime-release-integrity.mjs` required `ignoreDeprecations: "6.0"`, a value the pinned TypeScript 5.9 rejects (TS5103) — the check was unsatisfiable as shipped (either the check failed or the compiler did). It now requires `"5.0"`, matching the pinned compiler, with a comment to revisit on the TS 6 upgrade. `scripts/validate-publishability.mjs` no longer requires the `@aoc/protocol` sibling checkout: when the checkout is absent it falls back to the type-only stub package at `tests/fixtures/protocol-stub` and independently asserts that no shipped artifact imports `@aoc/protocol` at runtime.

### New tooling

| file | purpose |
|---|---|
| `scripts/benchmark-enterprise.mjs` | Reproducible performance baseline (Part 6). |
| `scripts/load-test-enterprise.mjs` | Concurrent load/contention characterization (Part 7). |
| `scripts/generate-release-manifest.mjs` | Deterministic release manifest with artifact checksums (Part 15). |

### New package

`packages/enterprise-host-sdk/` — `@aoc-enterprise/enterprise-host-sdk` 1.0.0: typed fetch-based client for the frozen v1 HTTP surface; errors (`EnterpriseHostApiError`/`TimeoutError`/`NetworkError`), per-request timeouts, retry guidance in README; zero dependencies; tested against a scripted stub host (Part 8).

### Documentation (new)

`docs/security/THREAT_MODEL_V1.md`, `docs/security/SECURITY_HARDENING_V1.md`, `docs/enterprise/API_STABILITY_V1.md`, `docs/enterprise/MIGRATION_REVIEW_V1.md`, `docs/testing/TEST_STRATEGY_V1.md`, `docs/operations/{DEPLOYMENT_GUIDE_V1,RUNBOOKS_V1,BACKUP_RECOVERY_V1}.md`, `docs/performance/{BENCHMARK_BASELINE_V1,LOAD_TEST_V1}.md`, `docs/release/{DEPENDENCY_AUDIT_V1,DOCUMENTATION_AUDIT_V1,RELEASE_CANDIDATE_V1}.md`, `CHANGELOG.md`, `release/RELEASE_MANIFEST.json`.

### Documentation (reconciliation fixes)

`docs/enterprise/AOC_ENTERPRISE_HOST.md`, `docs/enterprise/AOC_AGENT_PASSPORT_CURRENT_MODEL.md`, `docs/kernel/AOC_KERNEL_INVARIANTS_V1.md`, `docs/runtime/contract-versioning-strategy.md`, `docs/sdk/runtime-consumption.md`, `docs/sdk/versioning-and-stability.md` — safe one-line factual corrections (broken paths, stale test-command description, missing SDK entrypoints), each listed in `DOCUMENTATION_AUDIT_V1.md`.

## Known risks

1. **SQLite single-writer ceiling.** Governance-evaluate write throughput saturates ~130 rps/instance at 32-way concurrency with authentication enabled (documented); scaling is vertical or per-tenant-instance. By design; not a defect.
2. **`next` advisories in `apps/agent-passport-web`** (private demo app, not part of the runtime deliverable) — upgrade to next 16 is breaking, deferred post-v1.
3. **First-open cold outliers** (~80 ms first write) — prepared-statement/WAL warmup; p95 unaffected.
4. **`check:runtime-federation` — resolved.** The standalone script previously failed on `main` and on this branch alike (`reconciliation_failed:rejected`) because its expected scenario had drifted from the envelope contract; the script scenario was fixed (runtime federation code unchanged), it now passes, and it runs as part of `npm run validate:v1-release`. See `docs/release/RUNTIME_FEDERATION_V1.md`.
5. **Manifest commit reference** — `release/RELEASE_MANIFEST.json` records the commit at generation time; regenerate when cutting the final tag.

## Accepted risks (full analysis in `THREAT_MODEL_V1.md` §8)

Auth disabled by default (dev posture; deployment guide mandates enabling); digests provide integrity, not signatures/non-repudiation; filesystem-level attacker with full re-seal capability out of software scope; no in-process rate limiting / field-length caps / Content-Type enforcement / pagination (proxy-bounded, additive in v1.x); reads don't re-verify digests (explicit verify endpoints + scheduled verification); no Unicode normalization in canonical JSON (deterministic as-is; changing would break every digest); `/health` unauthenticated.

## Explicit post-v1 work

- Pagination/filtering on collection endpoints and an HTTP governance query endpoint (service exists, unexposed) — additive v1.x.
- Per-field length caps, Content-Type enforcement, optional in-process rate limiting — additive v1.x.
- Corruption-specific error codes for the remaining raw `JSON.parse` row-mapper sites (passport/assurance).
- Cryptographic signatures / non-repudiation layer (constitutional discussion required).
- `apps/agent-passport-web`: next 16 upgrade; advisories re-audit.
- Promote or remove stub workspaces (`governance-treaties`, `runtime-negotiation`) and their parked `.test.skip.ts` suites; align `control-plane-sdk` test script with the standard convention.
- Retire/mark-historical the obsolete docs flagged in `DOCUMENTATION_AUDIT_V1.md` (five `CURRENT_STATE_*` session logs, pre-PR baseline snapshots, `repo-boundaries.md`).
- TypeScript 6 upgrade (then move the `ignoreDeprecations` guard in `check-runtime-release-integrity.mjs` to `"6.0"`).
- Long-duration soak and large-corpus (millions of rows) performance profiles.
