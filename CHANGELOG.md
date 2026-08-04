# Changelog

All notable changes to AOC Enterprise. The project follows [Semantic Versioning](https://semver.org/): the public HTTP API surface, the exported package entrypoints, and the store schema identifiers are the compatibility contract (see `docs/enterprise/API_STABILITY_V1.md`).

## [Unreleased]

### Security
- **Fixed: `verifyCapabilityToken` (root-exported, `./crypto` subpath) previously returned `valid: true` for every capability token, including revoked and expired ones — a complete authorization bypass.** The function read `jti`, `trust_domain`, and `exp` off the token via an `as unknown as Record<string, unknown>` cast; none of those fields exist on the real `@aoc/protocol` `CapabilityToken` contract (the real fields are `tokenId`, `expiresAt`, and `revocationRefs`), so every guard condition was permanently unreachable and some malformed inputs (e.g. `null`) threw an uncaught `TypeError` instead of failing closed. The cast is removed; the function now validates against the real contract fields, revoked and expired tokens are correctly rejected, and malformed input returns `invalid` without throwing.
  - **Open gap — trust domain is not enforced.** The real `CapabilityToken` carries no trust-domain-bearing claim (the old `trust_domain` check never had a real field to read, on top of being misspelled), so it has been removed rather than reimplemented against an invented field or an unproven mapping (e.g. guessing `issuer` means trust domain). `CapabilityVerificationContext.trustDomain` is retained on the type to avoid a breaking signature change but is documented as unused and unenforced. Enforcing trust-domain isolation requires a product decision (e.g. adopting `@aoc/protocol`'s `TrustRegistryProvider`) that is out of scope for this fix — tracked as a follow-up.
  - **Open gap — signature verification is structural only, not cryptographic.** `CapabilityToken.proof` carries no signature bytes or key material, so `verifyCapabilityToken` can check proof *shape* (a recognized `proofType` with a non-empty `proofRef`) but not cryptographic integrity. Full tamper detection requires wiring `@aoc/protocol`'s `VerificationKeyResolver` port, which is out of scope for this fix — tracked as a follow-up.
  - **Open gap — revocation is checked against the caller-supplied `revokedJti` set only.** `CapabilityToken.revocationRefs` point at the protocol's `RevocationLookup` port, which Enterprise does not wire up anywhere; a token that declares `revocationRefs` this function cannot resolve now fails closed (`revocation_status_indeterminate`) rather than being silently treated as clear. Adopting `RevocationLookup` is out of scope for this fix — tracked as a follow-up.

## [1.0.0] — 2026-07-12

First production release. PR-008 is a hardening-only release: no new products, no new architecture, no functional behavior changes except fail-closed corrections listed below.

### Security (hardening; see `docs/security/SECURITY_HARDENING_V1.md`)
- **HTTP adapter fails closed on synchronous errors.** Auth rejections on passport/assurance routes, malformed percent-encoding in path segments, and invalid request URLs now return proper `401`/`400` error envelopes instead of raising uncaught exceptions.
- **Constant-time API-key matching.** Bearer tokens are compared via fixed-length SHA-256 digests with no early exit, removing the timing side channel; bearer parsing deduplicated into `orchestration/credential-matching.ts`.
- **Schema-version guards on all stores.** The Agent Passport and Assurance SQLite stores now refuse to open a database recorded under a different schema version (the Governance store already did). Rollback across schema versions requires restoring the matching backup.
- **Structured SQLite error classification.** Passport/assurance constraint violations are detected by `SQLITE_CONSTRAINT*` error codes instead of message-string sniffing.
- **Validated `busy_timeout` pragma** (positive safe integer) in all three stores; store error mappers now preserve the underlying error message; unhandled-error logs record the real route instead of a fixed label.
- **Schema-version check now runs before schema creation.** The Agent Passport and Assurance stores previously ran `CREATE TABLE IF NOT EXISTS` before checking the recorded schema version, so a refused foreign-schema database could still have this runtime's own (empty) tables created in it. The version is now checked first; a foreign-schema database is left untouched when refused (regression tests assert no mutation).
- **SDK `reactivatePassport` now posts the field the Host actually validates** (`reactivatedBy`, not `actorId`) — the method was unusable through the SDK before this fix.
- **SDK `IssuePassportRequest` type corrected** to mirror the real wire shape (nested `subject`/`organization` objects plus top-level `actorId`) instead of a flat shape that would deterministically fail Host validation.
- **Load test correctness phase now verifies concurrently-written records**, not a separate sequentially-seeded batch — a corrupted or dropped concurrent write would previously have been invisible to the correctness checks.

### Test harness (see `docs/testing/TEST_STRATEGY_V1.md`)
- `npm test` is now clean and deterministic: it runs compiled `dist/src/**/*.test.js`, the repo-level `tests/*.test.mjs` contract suites, and every workspace suite (`--if-present`). Bare `node --test` discovery — which structurally failed 413 raw `.ts` source files — is gone. 0 failing tests; no test was removed or weakened. New scripts: `test:root`, `test:workspaces`.
- Accidentally committed build artifacts (`apps/agent-passport-web/dist-test/`, a stray `tsconfig.tsbuildinfo`) untracked.

### Added
- **`@aoc-enterprise/enterprise-host-sdk`** — minimal typed HTTP client for the Enterprise Host v1 API (transport only: typed methods per endpoint, error taxonomy, timeouts; retry guidance documented, no business logic).
- **Performance harness** — `scripts/benchmark-enterprise.mjs` and `scripts/load-test-enterprise.mjs`, with recorded baselines in `docs/performance/`.
- **Release manifest generator** — `scripts/generate-release-manifest.mjs` → `release/RELEASE_MANIFEST.json` (versions, store schemas, framework digests, artifact checksums, compatibility matrix).
- **Consolidated v1 release gate** — `npm run validate:v1-release`: the `validate:release` checks plus `check:runtime-federation`, API-freeze verification against `release/api-surface.v1.json`, release-manifest verification, release-documentation check, and SDK-surface check. `validate:publishability` no longer requires the `@aoc/protocol` sibling checkout (falls back to the type-only stub in `tests/fixtures/protocol-stub` and asserts no shipped artifact imports `@aoc/protocol` at runtime).
- **Release documentation set** — threat model, security hardening report, API stability report (frozen v1 surface), migration review, test strategy, deployment guide, runbooks, backup & recovery guide, dependency audit, documentation audit.
- Root `engines: { node: ">=22" }`.
- Regression suites: `http-adapter-hardening.test.ts`, `sqlite-store-version-guard.test.ts`, SDK client tests.

### Portability, backup & restore validation (see `docs/release/AOC_ENTERPRISE_V1_PORTABILITY_REPORT.md`)
- **`npm run backup:v1` / `npm run restore:v1`** — one official, fail-closed backup and restore command for the three independent SQLite stores, replacing the manual `sqlite3 .backup` procedure as the recommended default. Versioned backup format (`aoc.enterprise.backup.v1`), SHA-256 checksums, `PRAGMA integrity_check`, and schema-version compatibility are all validated before any file is copied; restore refuses to overwrite an existing target without `--force`, takes a pre-restore safety copy first, and rolls back on any post-restore verification failure.
- **`npm run validate:portability:v1`** — a fully automated clean-room drill: extracts the exact tracked commit via `git archive` outside the working tree, installs from the lockfile, builds, tests, seeds a synthetic fixture, backs it up, destroys the source stores, restores from the backup alone, proves full logical equivalence (Governance/Evidence/Passport/Assurance), and reruns the v1 release gate.
- **`npm run check:portability-smoke`** — a bounded, in-process version of the same backup/restore/compare cycle, now part of `npm run validate:v1-release` for routine coverage.
- 18 new backup/restore contract tests (`tests/portability-backup-restore.contract.test.mjs`) plus manual failure-injection coverage of tampered checksums, unsupported formats/schema versions, path traversal, symlink attacks, and missing stores.
- New docs: `AOC_ENTERPRISE_V1_PORTABILITY_CURRENT_STATE.md`, `AOC_ENTERPRISE_BACKUP_V1.md`, `AOC_ENTERPRISE_RESTORE_V1.md`, `AOC_ENTERPRISE_CLEAN_ROOM_DRILL.md`, `AOC_ENTERPRISE_V1_PORTABILITY_REPORT.md`, `AOC_ENTERPRISE_V1_TAGGING_RUNBOOK.md`; threat model extended with a backup/restore threat review (§7.17); root `.env.example` added.
- No product features, Kernel decisions, Governance/Evidence/Passport/Assurance semantics, SAF controls, storage model, or public API changed.

### Versioning
- Package version `0.1.0` → `1.0.0`. Runtime component versions (Enterprise Host 1.0.0, Kernel 1.0.0, Governance Store 1.0.0, Evidence Bundle 1.0.0, Agent Passport Runtime 1.0.0, Assurance Runtime 1.0.0) and store schema identifiers (`aoc.governance-store.schema.v1`, `evidence.bundle.v1`, `aoc.agent-passport.schema.v1`, `aoc.assurance-store.schema.v1`, `aoc.canonical-json.v1`) are unchanged and now frozen.

### Compatibility
- No breaking changes. All existing endpoints, request/response schemas, status codes, error codes, exports, and store schemas are preserved exactly. The only observable behavior changes are the fail-closed corrections above (crashes → proper error envelopes; foreign-schema stores → refused at startup).

## [0.1.0]

Pre-release development line (PR-001 … PR-007): Kernel, Enterprise Host, Governance Store, Evidence Bundle, Agent Passport Runtime, Module Lifecycle & Registry, Assurance Runtime.
