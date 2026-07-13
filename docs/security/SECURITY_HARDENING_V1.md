# AOC Enterprise — Security Hardening Report (v1.0.0)

Status: release deliverable for AOC Enterprise v1.0.0 (PR-008).
Companion: `THREAT_MODEL_V1.md` (threats, accepted risks), `docs/enterprise/API_STABILITY_V1.md`, `docs/enterprise/MIGRATION_REVIEW_V1.md`.

This report records what was audited for the v1.0.0 release, what was found, what was changed, and what was deliberately left as-is. No functional behavior changed except where a defect made the runtime fail open (crash or misreport) instead of failing closed.

---

## 1. Audit scope & method

Full manual review of `src/enterprise` (HTTP adapter, API contracts, orchestration, governance store, evidence, passport, assurance, configuration, health, lifecycle) plus the three SQLite store implementations, focused on:

input validation · canonicalization · error handling · boundary/enum/identifier validation · length & payload limits · JSON parsing · file operations · digest verification & hash comparison · timing-safe comparison · tenant isolation · prepared statements · transactions · SQLite pragmas · concurrency · temporary files · memory usage · resource cleanup · fail-closed behavior · silent fallbacks · hidden defaults · mutable shared state.

All 3,700+ tests pass before and after; `npm run validate:release` is green.

## 2. Findings fixed in v1.0.0

### H-1 Uncaught synchronous throws in the HTTP adapter (fail-open → fail-closed) — HIGH
`src/enterprise/adapters/node-http-adapter.ts` resolved the access context for passport/assurance routes synchronously in the listener body; with `AOC_ENTERPRISE_REQUIRE_AUTH=true`, a missing/unknown token threw *outside* any catch, producing an uncaught exception instead of a 401. The same applied to `decodeURIComponent` on malformed percent-encoded path segments (`GET /api/passports/%ZZ` → uncaught `URIError`) and to invalid `req.url` values in `new URL(...)`.
**Fix:** the entire dispatch now runs inside a fail-closed wrapper: every synchronous throw is routed through the standard error envelope (`URIError` → `400 INVALID_REQUEST`, auth errors → their own status, anything else → `500 INFRASTRUCTURE_FAILURE`). Regression tests: `src/enterprise/__tests__/http-adapter-hardening.test.ts`.

### H-2 Variable-time API-key comparison — MEDIUM
Both auth paths matched bearer tokens with `apiKeys.find(k => k.key === token)` — early-exit string equality leaks match length/position timing.
**Fix:** `src/enterprise/orchestration/credential-matching.ts` — both sides are SHA-256-hashed and compared over fixed-length hex with a bitwise accumulator; every configured key is always compared (no early exit on match). The duplicated bearer-parsing helper was deduplicated into the same module. Tests cover exact/prefix/superstring/empty candidates.

### H-3 Passport & Assurance stores accepted foreign schema versions — MEDIUM
`createSqlitePassportStore`/`createSqliteAssuranceStore` inserted a version row when none existed but never compared an existing row against the runtime's schema version — a database written by a different (e.g. future) schema would be silently used. The Governance store already refused (`GOVERNANCE_SCHEMA_VERSION_UNSUPPORTED`).
**Fix:** both stores now read the latest recorded `schema_version` and refuse to open on mismatch (`PASSPORT_STORE_UNAVAILABLE` / `ASSURANCE_STORE_UNAVAILABLE`), closing the connection first. Regression tests: `src/enterprise/__tests__/sqlite-store-version-guard.test.ts`. Operational impact documented in `MIGRATION_REVIEW_V1.md` and the rollback runbook.

### H-4 Constraint detection by error-message sniffing — LOW
Passport/assurance stores classified uniqueness violations via `message.includes('UNIQUE')` — locale/version-fragile and over-broad.
**Fix:** both now use the structured SQLite error code (`code.startsWith('SQLITE_CONSTRAINT')`), matching the governance store's existing approach.

### H-5 Unvalidated pragma interpolation — LOW
`busy_timeout = ${options.busyTimeoutMs}` interpolated a caller-supplied number into a pragma string in all three stores (config-sourced, not attacker-reachable, but unvalidated).
**Fix:** shared validation — `busyTimeoutMs` must be a positive safe integer or construction throws `RangeError`.

### H-6 Swallowed error causes in store error mapping — LOW
The governance store's generic transaction-failure path and the assurance framework-persist path discarded the underlying error message, hiding root causes from operators.
**Fix:** original messages are appended to the mapped store error (codes unchanged; messages are not API contract).

### H-7 Misleading fixed route label in error logs — LOW
`writeError` logged `route: 'POST /api/governance/evaluate'` for **every** unhandled error regardless of route, poisoning incident diagnosis.
**Fix:** the actual `METHOD url` (bounded to 256 chars) is logged.

## 3. Audited and confirmed sound (no change)

- **Prepared statements everywhere.** No string interpolation of data into SQL in any store, including all dynamically composed query filters (constant clause fragments + bound parameters). SQL injection: not present.
- **Canonicalization.** Single shared canonicalizer, version-pinned, total over accepted inputs, rejects non-canonical values (non-finite numbers, bigint, functions, circular refs, foreign prototypes, invalid dates), normalizes `-0`, omits `undefined` keys, sorts keys deterministically. No second canonicalizer exists.
- **Digest discipline.** All digests SHA-256 over canonical JSON with context-bound inputs; verification recomputes from source and never trusts stored values; digest shape validated (`^sha256:[0-9a-f]{64}$`). Digest equality checks are plain `===` — appropriate, since digests are public integrity values, not secrets (the only secret comparison, API keys, is timing-safe per H-2).
- **Tenant isolation.** Enforced in the store layer via shared helpers; cross-tenant query filters rejected; defensive `1 = 0` for scope-less non-system callers; passport reads authorize against the event-derived organization before returning; assurance reads filter by organization for non-system contexts.
- **Transactions & durability.** Every multi-row write is a single synchronous transaction; `synchronous=FULL`, WAL, `foreign_keys=ON`; the evaluate flow never returns success without a durable commit.
- **Append-only invariants.** Governance hash chain (`chain_position UNIQUE` + previous-digest linkage); passport event chain (contiguous sequence + chained digests); assurance finding events/manual reviews/signals append-only; completed assessments immutable (supersession only).
- **Payload bounds.** 1 MiB streaming transport cap with connection destruction; store-level payload caps (413); empty body → `{}`; malformed JSON → 400.
- **Configuration parsing.** All env parsers fail safe (invalid numeric → default, booleans strict `1`/`true`); no hidden env vars outside the configuration module (single `npm_package_version` read in health, display-only); secrets never logged — the configuration checksum covers shape only (`apiKeyCount`, never key material).
- **No mutable shared state.** Composition wires immutable configuration and per-store handles; framework registry freezes before traffic; no module-level mutable caches in the enterprise tree.
- **Resource cleanup.** Stores expose `close()` and guard post-close use (`assertOpen`); servers close their stores on shutdown; temp-file usage in tests uses `mkdtemp` under the OS temp dir.
- **File operations.** Only configuration-derived paths; parent directories created explicitly; no request-derived path ever reaches the filesystem.

## 4. Deliberately unchanged (documented, accepted for v1)

| Item | Rationale |
|---|---|
| Auth disabled by default | Local-dev ergonomics; deployment guide mandates enabling it in production. Changing the default would break existing local setups in a release that promises no behavioral breaks. |
| No per-field length caps / lenient Content-Type / unbounded collection reads / no in-process rate limiting | Bounded by the 1 MiB cap; additive v1.x candidates; changing now would alter observable API behavior. |
| Non-enveloped 500/409 bodies on three routes | Frozen wire behavior (see `API_STABILITY_V1.md` §3); changing shapes is a breaking change. |
| Reads don't re-verify digests | Explicit `verify` endpoints exist; scheduled verification is an operational control (runbooks). |
| Raw `JSON.parse` in some passport/assurance row mappers | Corrupted columns fail closed as 500 at the adapter; wrapping them in corruption-specific codes is post-v1 polish. |
| No cryptographic signatures | Constitutional constraint (no external signing infrastructure in v1); digests provide integrity, not non-repudiation. |

## 5. Verification

- `npm run typecheck` / `npm run build` / `npm run lint` — clean.
- `npm test` — 3,700+ tests, 0 failures (includes the new hardening regression suites).
- `npm run validate:release` — green end-to-end.
- Benchmarks & load tests executed post-hardening (`docs/performance/`): no measurable regression from the fail-closed wrapper or constant-time key matching.
