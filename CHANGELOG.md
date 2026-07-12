# Changelog

All notable changes to AOC Enterprise. The project follows [Semantic Versioning](https://semver.org/): the public HTTP API surface, the exported package entrypoints, and the store schema identifiers are the compatibility contract (see `docs/enterprise/API_STABILITY_V1.md`).

## [1.0.0] — 2026-07-12

First production release. PR-008 is a hardening-only release: no new products, no new architecture, no functional behavior changes except fail-closed corrections listed below.

### Security (hardening; see `docs/security/SECURITY_HARDENING_V1.md`)
- **HTTP adapter fails closed on synchronous errors.** Auth rejections on passport/assurance routes, malformed percent-encoding in path segments, and invalid request URLs now return proper `401`/`400` error envelopes instead of raising uncaught exceptions.
- **Constant-time API-key matching.** Bearer tokens are compared via fixed-length SHA-256 digests with no early exit, removing the timing side channel; bearer parsing deduplicated into `orchestration/credential-matching.ts`.
- **Schema-version guards on all stores.** The Agent Passport and Assurance SQLite stores now refuse to open a database recorded under a different schema version (the Governance store already did). Rollback across schema versions requires restoring the matching backup.
- **Structured SQLite error classification.** Passport/assurance constraint violations are detected by `SQLITE_CONSTRAINT*` error codes instead of message-string sniffing.
- **Validated `busy_timeout` pragma** (positive safe integer) in all three stores; store error mappers now preserve the underlying error message; unhandled-error logs record the real route instead of a fixed label.

### Test harness (see `docs/testing/TEST_STRATEGY_V1.md`)
- `npm test` is now clean and deterministic: it runs compiled `dist/src/**/*.test.js`, the repo-level `tests/*.test.mjs` contract suites, and every workspace suite (`--if-present`). Bare `node --test` discovery — which structurally failed 413 raw `.ts` source files — is gone. 0 failing tests; no test was removed or weakened. New scripts: `test:root`, `test:workspaces`.
- Accidentally committed build artifacts (`apps/agent-passport-web/dist-test/`, a stray `tsconfig.tsbuildinfo`) untracked.

### Added
- **`@aoc-enterprise/enterprise-host-sdk`** — minimal typed HTTP client for the Enterprise Host v1 API (transport only: typed methods per endpoint, error taxonomy, timeouts; retry guidance documented, no business logic).
- **Performance harness** — `scripts/benchmark-enterprise.mjs` and `scripts/load-test-enterprise.mjs`, with recorded baselines in `docs/performance/`.
- **Release manifest generator** — `scripts/generate-release-manifest.mjs` → `release/RELEASE_MANIFEST.json` (versions, store schemas, framework digests, artifact checksums, compatibility matrix).
- **Release documentation set** — threat model, security hardening report, API stability report (frozen v1 surface), migration review, test strategy, deployment guide, runbooks, backup & recovery guide, dependency audit, documentation audit.
- Root `engines: { node: ">=22" }`.
- Regression suites: `http-adapter-hardening.test.ts`, `sqlite-store-version-guard.test.ts`, SDK client tests.

### Versioning
- Package version `0.1.0` → `1.0.0`. Runtime component versions (Enterprise Host 1.0.0, Kernel 1.0.0, Governance Store 1.0.0, Evidence Bundle 1.0.0, Agent Passport Runtime 1.0.0, Assurance Runtime 1.0.0) and store schema identifiers (`aoc.governance-store.schema.v1`, `evidence.bundle.v1`, `aoc.agent-passport.schema.v1`, `aoc.assurance-store.schema.v1`, `aoc.canonical-json.v1`) are unchanged and now frozen.

### Compatibility
- No breaking changes. All existing endpoints, request/response schemas, status codes, error codes, exports, and store schemas are preserved exactly. The only observable behavior changes are the fail-closed corrections above (crashes → proper error envelopes; foreign-schema stores → refused at startup).

## [0.1.0]

Pre-release development line (PR-001 … PR-007): Kernel, Enterprise Host, Governance Store, Evidence Bundle, Agent Passport Runtime, Module Lifecycle & Registry, Assurance Runtime.
