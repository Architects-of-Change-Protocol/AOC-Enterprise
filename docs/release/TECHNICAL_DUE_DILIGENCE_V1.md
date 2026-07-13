# AOC Enterprise v1.0.0 — Technical Due Diligence (PR-RC Objective 12)

CTO-level assessment for the v1.0.0 tag decision. Every finding carries severity, impact, recommended action, and whether it blocks v1. Evidence base: independent re-verification on this branch (clean rebuild, full test suite, all gates), not prior reports.

## 1. Architecture & coupling — Strong

Layering is real and machine-enforced, not aspirational: `npm run lint` runs three custom analyzers (node16 import discipline, architecture boundaries, public-surface control), and `check:aoc-boundaries` / structural-boundary tests pin the Kernel↔Enterprise↔Runtime separation. The HTTP adapter is the single transport-aware module; composition happens in one root; stores are constructed behind provider selection with no fallback. Domain modules (governance-store, evidence, passport, assurance) share exactly two primitives (canonical JSON, digest) and otherwise communicate through explicit service interfaces.

- **Finding DD-1 (LOW / maintainability):** `src/features/**` contains substantial demo/pilot verticals compiled and tested with the runtime. Impact: build time and repo weight, no runtime coupling (boundary lint keeps them out of the enterprise tree). Action: extract or prune post-v1. **Not blocking.**

## 2. Dependency graph — Exceptional for the category

One production dependency (`better-sqlite3`, lazily imported only for the sqlite provider); SDK has zero; lockfile v3 pinned; `npm ci`-reproducible; no copyleft licensing anywhere in the tree. Known advisories are confined to the private `apps/agent-passport-web` demo (next 14) — outside the release deliverable.

- **Finding DD-2 (MEDIUM / operational):** native-module dependency means platform-specific prebuilds; a Node major bump can require a `better-sqlite3` rebuild. Impact: deployment friction on exotic platforms. Action: document (done in deployment guide); consider `node:sqlite` when it stabilizes. **Not blocking.**

## 3. Store / module / tenant isolation — Strong, verified empirically

Three independent SQLite stores (no cross-store FKs, separate files); module registry with topological lifecycle and health rollup; tenant scoping enforced *in the store layer* with shared helpers. New in this validation: the load test proves isolation **under concurrency** with real org-scoped credentials — 0 cross-tenant leaks in probes, same-tenant control reads all succeed, and a 32-way same-key write race commits exactly once with 31 clean constraint rollbacks.

- **Finding DD-3 (LOW / security posture):** authentication defaults OFF (dev ergonomics). Impact: a mis-deployed host is open. Action: deployment guide mandates enabling; consider flipping the default in v2. **Not blocking (documented accepted risk).**

## 4. Determinism, canonicalization, append-only — Strong

Single canonicalizer, version-pinned, rejection of ambiguous inputs; SHA-256 digests with context-bound inputs; hash-chained governance records; event-sourced passports with chain verification; assurance assessments sealed by section digests and re-derived (never trusted) on verify. Injected clocks/id-generators throughout; no `Math.random`/`Date.now` on any governed path. The threat-model addendum maps all nineteen protocol-specific attack classes to concrete mechanisms or documented accepted risks.

- **Finding DD-4 (MEDIUM / product):** integrity ≠ non-repudiation — no signature layer, so offline third-party verification without store access is limited. Impact: constrains some audit/assurance sales narratives. Action: signature layer as the flagship post-v1 security feature. **Not blocking (explicit v1 scope decision).**

## 5. Versioning & error taxonomy — Strong

SemVer 1.0.0 with frozen HTTP surface (machine-enforced by `check-api-freeze`), frozen schema identifiers, schema-version guards on all stores (refuse foreign versions), stable error-code taxonomy documented per route. Error messages are explicitly non-contract.

- **Finding DD-5 (LOW / API polish):** three non-enveloped error responses and the 400-vs-413 oversize split are frozen quirks. Impact: minor client complexity, documented. Action: normalize in v2 only. **Not blocking.**

## 6. Operational readiness — Good

Deployment guide (full env-var reference, systemd/container/proxy), 14 runbooks, backup/recovery with RPO/RTO, health/liveness/readiness endpoints, structured JSON logs, telemetry hooks, benchmark + load baselines with reproduction instructions, and a single self-contained release gate (`validate:v1-release`).

- **Finding DD-6 (MEDIUM / ops):** no built-in metrics endpoint (Prometheus-style); observability is logs + health probes + client-side measurement. Impact: operators wire their own scraping. Action: post-v1 additive `/metrics`. **Not blocking.**
- **Finding DD-7 (LOW / ops):** single-writer SQLite caps write throughput (~130–160 rps evaluate at 32-way on reference hardware) and rules out multi-process sharing. Impact: known scaling model (vertical / per-tenant instances), stated everywhere. **Not blocking (by design).**

## 7. Maintainability & transferability — Strong

TypeScript strict mode everywhere (incl. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`); 3,734 tests green from a clean checkout with zero external repositories; the release can be validated by any engineer with `npm ci && npm run validate:v1-release`; documentation reconciled with two audit passes; ADRs record the architectural decisions. Onboarding surface is well-lit: the codebase's invariants are enforced by scripts a newcomer cannot accidentally bypass.

- **Finding DD-8 (LOW / hygiene):** stub workspaces (`governance-treaties`, `runtime-negotiation`) with parked `.test.skip.ts` suites, an inconsistent `control-plane-sdk` test script, and flagged-obsolete historical docs remain. Impact: cosmetic confusion. Action: post-v1 cleanup list already exists. **Not blocking.**

## 8. OSS / commercial / IP posture

- **OSS readiness: good.** Clean licensing (MIT-compatible tree), no test-framework lock-in, self-contained validation, contribution-ready docs. Gaps for a public launch: CONTRIBUTING/CoC/SECURITY.md files, CI publishing pipeline, and the DD-8 cleanup. None affect the tag.
- **Commercial/enterprise readiness: good for design-partner and pilot deployments.** Deterministic verifiable governance with empirical correctness-under-load evidence is a differentiated, demo-able claim. The single-writer scaling model and absent signature layer bound the initial ICP (single-instance, per-tenant deployments; online verification).
- **IP defensibility: moderate-plus.** The defensible core is the composed protocol — canonical JSON v1 + context-bound digest chains + deterministic assurance scoring + fail-closed governance pipeline — expressed in ~1,300 tests and enforced invariants, which is harder to replicate than any single component. No third-party IP encumbrance found (one MIT native dependency).
- **Valuation impact:** the release-gate work materially de-risks technical diligence by an acquirer/investor: every claim in the data room (tests, benchmarks, load, API freeze, manifest checksums) is regenerable from a clean checkout by one command. The honest known-issues ledger cuts both ways and nets positive.

## 9. Technical debt register (consolidated)

| item | severity | blocks v1? |
|---|---|---|
| No signature/non-repudiation layer | MEDIUM | No (accepted, documented) |
| Auth off by default | LOW | No (documented) |
| No /metrics endpoint | MEDIUM | No |
| No pagination on list endpoints; no field-length caps; lenient Content-Type | LOW | No (frozen; additive v1.x) |
| Raw `JSON.parse` in some row mappers (corruption → generic 500) | LOW | No |
| CJS-only SDK (no tree-shaking) | LOW | No |
| Stub workspaces / parked tests / obsolete historical docs | LOW | No |
| `next` advisories in private demo app | MEDIUM (app-local) | No (outside deliverable) |
| Large-corpus & multi-hour soak profiles missing | LOW | No |

## 10. Release risk assessment

Residual release risk is **low**. The failure modes that remain are bounded and documented: scaling ceiling (architectural, disclosed), operator misconfiguration (documented, fail-closed defaults except auth), and ecosystem advisories outside the shipped runtime. No unresolved correctness, integrity, isolation, or reproducibility issue is known. Every previously open blocker (publishability portability, federation check) is closed with evidence.

**Conclusion: ready to tag v1.0.0.** The remaining findings are post-v1 roadmap items, none rising to blocker severity.
