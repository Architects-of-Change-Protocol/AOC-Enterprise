# AOC Enterprise v1.0.0 — Release Candidate Validation Report (PR-RC)

Independent validation of the PR-008 release candidate. Every prior claim was treated as a hypothesis and re-verified against the repository from a clean rebuild; nothing was assumed from documentation. This document consolidates the Independent Release Audit, Benchmark/Load validation, API Freeze certification, Publishability and Manifest validation, Known Issues, Exact Verification Results, and the Final Recommendation. Companion deliverables: `RUNTIME_FEDERATION_V1.md`, `SDK_AUDIT_V1.md`, `TECHNICAL_DUE_DILIGENCE_V1.md`, `../security/THREAT_MODEL_V1_ADDENDUM.md`.

---

## 1. Independent Release Audit (Objective 1)

Method: clean rebuild (`dist/` and all `tsbuildinfo` deleted first), fresh runs of every gate, code-level re-verification of each PR-008 hardening claim, and empirical probes where documentation asserted behavior.

| Prior claim (PR-008) | Verdict | Evidence |
|---|---|---|
| Typecheck/lint/build clean | **Verified** | Fresh clean-checkout run, exit 0 |
| `npm test` green, no accidental `.ts` discovery | **Verified** | 3,734 tests, 0 failures (3,300 root + 78 + 6 contract + 82 + 268 + 6 SDK workspace); explicit globs confirmed in `package.json` |
| HTTP adapter fails closed on sync errors (auth, `%ZZ`, bad URL) | **Verified** | `node-http-adapter.ts` dispatch wrapper present; regression suite `http-adapter-hardening.test.ts` passes; live probes return envelopes |
| Constant-time API-key matching | **Verified** | `credential-matching.ts`: fixed-length SHA-256 hex comparison, no early exit, all keys always compared; both auth paths use it |
| All three stores refuse foreign schema versions | **Verified** | Version guards present in all three store factories; `sqlite-store-version-guard.test.ts` passes |
| Constraint detection via `SQLITE_CONSTRAINT` codes; validated `busy_timeout` | **Verified** | Code inspection, all three stores |
| Tenant isolation enforced at store layer | **Verified (empirically)** | Load-test correctness phase: 0 cross-tenant leaks under concurrency, same-tenant control probes all visible |
| Append-only + hash chains intact | **Verified (empirically)** | Post-load digest re-verification 100% valid; passport chains gap-free; 32-way write race → exactly 1 winner |
| API surface = 27 endpoints as documented | **Verified** | `check-api-freeze.mjs`: static extraction matches freeze file; 34 live probes all wired; unknown-route canary correct |
| Release manifest reproducible | **Verified** | Two regenerations byte-identical; committed manifest checksums match an independent clean rebuild |
| `validate:publishability` requires sibling checkout | **Verified, then eliminated** | Reproduced the dependency; replaced (see §5) |
| `check:runtime-federation` fails on main | **Verified, then root-caused and fixed** | Tooling defect, runtime correct (see `RUNTIME_FEDERATION_V1.md`) |
| Benchmark/load numbers of PR-008 | **Partially Verified** | Deliberately not re-certified as numbers (Objective 2 scopes quality, not values); shapes reproduced, methodology strengthened, new baselines recorded |
| Docs fully consistent | **Partially Verified → remediated** | Release-track docs re-swept; stale statements (sibling-checkout requirement, open federation issue) corrected this PR; historical docs remain flagged obsolete (post-v1) |

No PR-008 claim was found **Not Verified**.

## 2. Benchmark Validation (Objective 2)

Quality audit of `scripts/benchmark-enterprise.mjs`, with improvements applied where an engineer could not have reproduced it faithfully:

| criterion | before | now |
|---|---|---|
| Reproducibility | ✅ two flags, self-configuring, temp stores | unchanged (documented: no env vars read) |
| Deterministic datasets | ✅ fixture-seeded, index-derived ids | unchanged |
| Warm-up | ❌ none — first-touch outliers polluted samples | ✅ 10 unrecorded warm-up iterations/scenario (3 quick); one-shot scenarios explicitly exempt |
| Cold/warm start | ✅ measured separately | unchanged |
| Iteration counts | ✅ 200/50, printed | + warm-up count printed |
| Hardware/Node description | ✅ environment block | unchanged |
| Statistical validity | ⚠️ mean/p50/p95/max only | ✅ + standard deviation |
| Variance reporting | ❌ | ✅ stddev per scenario |
| Outlier handling | ❌ invisible | ✅ Tukey-fence count reported; **outliers never discarded** |
| Isolation / cache effects | ✅ sequential, fresh stores, per-run temp dirs | warm-up now separates cache effects from steady state |

Effect visible in the recorded baseline: steady-state `max` for evaluate dropped 83 ms → 15 ms (the 83 ms was first-touch, now absorbed by warm-up), and the one genuinely heavy-tailed scenario (report projection, single 86 ms GC pause) is now *visibly* heavy-tailed via σ and the Tukey column instead of hiding in an average. Updated baseline: `docs/performance/BENCHMARK_BASELINE_V1.md`.

## 3. Load Validation (Objective 3)

The PR-008 load test measured throughput with status-code assertions only. It now validates correctness explicitly, with authentication enabled for the entire run (one system key + 32 org-scoped keys):

- **New concurrency scenarios:** parallel evidence builds, parallel passport issuance+activation per tenant, and a 32-way same-agent write race.
- **Correctness phase (9 checks, any failure exits non-zero):** governance/evidence/passport/assessment digest re-verification after concurrent writes (100% valid); passport event chains contiguous and ordered; cross-tenant assessment and passport reads denied (0 leaks) with non-vacuous same-tenant controls; write race committed exactly once with 31 clean `409` rollbacks.
- Coverage against the objective: parallel tenants ✅, evaluations ✅, evidence ✅, passports ✅, assessments ✅, verification ✅, signals ✅, reassessment ✅ (governed conflict path), report generation ✅ (continuous-state reads; in-process projection covered by benchmark), SQLite locking ✅, transaction rollback ✅ (race probe), tenant isolation under concurrency ✅, digest consistency ✅, event ordering ✅, append-only ✅.

Recorded run: `docs/performance/LOAD_TEST_V1.md` — ~6,900 requests, zero 5xx/timeouts, all 9 correctness checks PASS.

## 4. API Freeze Certification (Objective 5)

The v1 HTTP surface is now **frozen mechanically**, not just editorially:

- `release/api-surface.v1.json` — canonical freeze file: 10 route literals, 13 route patterns, 1 prefix guard, 9 passport actions, 34 probe requests covering all 27 endpoints.
- `scripts/check-api-freeze.mjs` (in the release gate) fails on **any** drift: routes added, removed, or re-patterned in the adapter source, plus live-probes every frozen route against a booted in-memory Host (an unknown-route canary proves the probe distinguishes wired from unwired).
- Request/response schemas, status codes, headers, error codes, idempotency semantics, and the frozen quirks (three non-enveloped responses; 400/413 oversize split; no pagination/sorting/filtering in v1) are certified in `docs/enterprise/API_STABILITY_V1.md`, re-verified this PR. No OpenAPI document exists in v1 (the stability contract is the normative artifact); generating one is a post-v1 nice-to-have.
- **No accidental breaking changes found**: static extraction from the adapter matches the freeze file exactly, and all 34 probes are wired.

## 5. Publishability Improvement (Objective 7)

- **Before:** `validate:publishability` hard-failed without a sibling `../Architects_of_Change_Protocol` checkout.
- **Root insight (verified):** `@aoc/protocol` is a *compile-time type-only* dependency — zero `require('@aoc/protocol')` in any shipped artifact.
- **After:** the check prefers the sibling checkout when present (full fidelity) and otherwise uses `tests/fixtures/protocol-stub/` — a type-only stand-in — **and in both cases scans every shipped JS artifact (1,410 files) to prove no runtime `@aoc/protocol` import exists**, which is the invariant that makes the stub faithful. If a value import is ever introduced, the check fails with instructions instead of silently passing.
- The full pipeline (pack tarball → install into external consumer → typecheck → build → resolve all 10 exports → invalid-import + declaration-leak checks → runtime-import scan) passes with no external repository. Runtime behavior untouched; the stub is allowlisted in the protocol-consumption guard as release tooling.

## 6. Manifest Validation (Objective 9)

- Generation refactored into a shared library (`scripts/lib-release-manifest.mjs`) used by both generator and verifier, eliminating dual-implementation drift.
- `scripts/verify-release-manifest.mjs` (in the release gate) proves: (a) **determinism** — consecutive regenerations byte-identical (no timestamps anywhere; artifacts sorted by path; framework digest stable); (b) **freshness** — the committed manifest equals a regeneration from the current build, ignoring only the `generated` commit/branch/node metadata block (regenerated once more at final tag).
- Checksums: SHA-256 over all 9 public export artifacts; the committed PR-008 manifest matched a fully clean rebuild on this branch, demonstrating build reproducibility from source.

## 7. Documentation Consistency (Objective 10)

Release-track documents (README, CHANGELOG, manifest, API stability, threat model + addendum, runbooks, deployment, backup, migration, test strategy, benchmark/load reports, dependency audit, SDK README) were cross-checked for version numbers, file references, counts, and post-PR-RC staleness; stale statements about the sibling-checkout requirement and the open federation issue were corrected in place. `scripts/check-release-docs.mjs` (in the release gate) now permanently enforces presence of the 18 release documents and version agreement across `package.json`, CHANGELOG, and manifest. Historical/pre-PR docs previously flagged obsolete remain flagged (post-v1 cleanup, unchanged position).

## 8. Release Quality Gate (Objective 11)

One command, zero external repositories:

```bash
npm run validate:v1-release
```

= typecheck → lint (3 analyzers) → build + compiled root tests + contract tests + workspace tests → protocol-consumption → runtime state/persistence/**federation**/vault → AOC boundaries → release integrity → **publishability (self-contained)** → **API freeze** → **manifest verification** → **release-docs presence/consistency** → **SDK surface**. Benchmark/load/runbook/threat-model presence is enforced by the release-docs step; their executability is demonstrated by the recorded baselines.

## 9. Known Issues (Objective / Deliverable 13)

**Must Fix Before v1:** none open — the two prior blockers (publishability portability, federation check) are closed in this PR with evidence.

**Should Fix After v1:** signature/non-repudiation layer; `/metrics` endpoint; pagination + field-length caps + Content-Type enforcement (additive); corruption-specific errors for remaining raw `JSON.parse` row mappers; `next@16` upgrade in the private demo app; large-corpus and multi-hour soak profiles; TypeScript 6 upgrade (then move the `ignoreDeprecations` guard to `6.0`).

**Nice To Have:** dual ESM/CJS SDK build (tree-shaking); OpenAPI document generated from the freeze file; retire flagged-obsolete historical docs; promote or remove stub workspaces and their parked `.test.skip.ts` suites; align `control-plane-sdk`'s test script with the workspace convention; OSS meta-files (CONTRIBUTING, SECURITY.md) if/when opened.

## 10. Exact Verification Results (Deliverable 14)

Environment: Node v22.22.2, linux x64, clean rebuild from this branch, no external repositories present.

| check | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | ✅ exit 0 (fresh, after full `dist` wipe) |
| lint | `npm run lint` | ✅ node16-imports, architecture, public-surface all pass |
| build | `npm run build` | ✅ exit 0 |
| tests | `npm test` | ✅ 3,734 tests / 0 fail (3,300 root; 6 contract suites; 78+82+268+6 workspace) |
| benchmarks | `node scripts/benchmark-enterprise.mjs` | ✅ full run recorded 2026-07-13 (13 scenarios, warm-up + σ + outlier reporting) |
| load | `node scripts/load-test-enterprise.mjs` | ✅ 10 scenarios, ~6,900 requests, 0 errors/timeouts, 9/9 correctness checks PASS |
| release gate | `npm run validate:v1-release` | ✅ exit 0, end-to-end, self-contained |
| API audit | `node scripts/check-api-freeze.mjs` | ✅ no drift; 34/34 frozen routes wired; canary correct |
| SDK audit | `node scripts/check-sdk-surface.mjs` + workspace tests | ✅ 5 frozen exports, 0 dependencies, self-contained sources; 6/6 tests |
| documentation audit | `node scripts/check-release-docs.mjs` + manual sweep | ✅ 18 documents present, versions consistent; stale statements corrected |
| manifest audit | `node scripts/verify-release-manifest.mjs` | ✅ deterministic; committed manifest matches clean rebuild |
| runtime federation | `npm run check:runtime-federation` | ✅ passes (tooling fixed; runtime untouched; contract suite unchanged-green) |
| publishability | `npm run validate:publishability` | ✅ passes with **no** sibling checkout; 1,410 shipped artifacts scanned, 0 runtime protocol imports |

## 11. Final Recommendation (Deliverable 15)

```
READY FOR TAG WITH DOCUMENTED KNOWN ISSUES
```

**Justification.** Every release blocker is closed with evidence rather than assertion: the release validates end-to-end from a clean checkout with a single command and no external repositories; the API surface, SDK surface, manifest, and documentation set are frozen and machine-enforced against drift; correctness — not just throughput — is demonstrated under concurrent load with authentication and real tenant credentials (digest consistency, event ordering, isolation, exactly-once contention semantics); the one failing check inherited from `main` is conclusively root-caused as a tooling defect with the runtime exonerated by its unchanged, passing contract suite; and an independent re-audit confirmed every PR-008 hardening claim in code. The qualifier — *with documented known issues* rather than an unconditional READY — reflects the deliberate, documented v1 scope boundaries (no signature layer, auth off by default, single-writer scaling model, additive API gaps) and app-local advisories outside the shipped runtime: none are defects in the release candidate, all are recorded in §9 and in the due-diligence register with owners in the post-v1 roadmap, and none meets blocker severity. Tag `v1.0.0` after regenerating the release manifest against the final commit.
