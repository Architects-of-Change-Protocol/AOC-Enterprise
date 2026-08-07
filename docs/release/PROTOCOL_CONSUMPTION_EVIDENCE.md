# Protocol Consumption Evidence

Evidence captured for the **Protocol Contract Adoption** sprint (Phases A and B). This is a
point-in-time record; re-run the commands below to refresh it after any change to
`protocol-consumer.lock.json`.

## Protocol artifact

| Field | Value |
| --- | --- |
| Protocol repository | `Architects-of-Change-Protocol/Architects_of_Change_Protocol` |
| Protocol commit | `c79e7529f4c0fda639803de861129335341e0744` |
| Protocol package | `@aoc/protocol` |
| Protocol package version | `0.1.0` (still `"private": true` -- not published to any registry) |
| Tarball filename | `aoc-protocol-0.1.0.tgz` |
| Vendored tarball path | `vendor/aoc-protocol-0.1.0.tgz` (tracked in git; see `vendor/README.md`) |
| Tarball size | 60,558 bytes |
| SHA-256 (not a cryptographic signature -- a content-integrity checksum) | `bc93d51783ef1899c0ca5fc94796129f3c27974c3f0fbf801232577247308bfc` |
| npm integrity | `sha512-IbnT5yTPAmiwCqCmAuHrxPapXeTqGEAmCOxu3JbCCsju0Wqi2aICy4g5XPKE8pDK6ich4nD+z+QVW1PU3fgsWA==` |
| Build provenance | Repository-supported local-checkout mode with the full pinned ref supplied and verified |
| Protocol's own consumer/package validation | `npm run protocol:consumer:check` -- **PASSED** during tarball build |

## Enterprise commit under validation

| Field | Value |
| --- | --- |
| Enterprise repository | `Architects-of-Change-Protocol/AOC-Enterprise` |
| Branch | `codex/enterprise-protocol-binding-slice-2-1` |
| Phase A commit | `e35ece985bfd5b133dc5664ca43e3bf449e30d49` ("feat(protocol): wire Enterprise to consume the real @aoc/protocol package") |
| Phase B commit | this sprint's contract-adoption commit (see git log) |
| Node version | v22.23.1 |
| npm version | 10.9.8 |

## Module resolution evidence (real package, not a shim)

- `node_modules/@aoc/protocol` is a real, materialized directory extracted from the vendored
  tarball -- confirmed **not a symlink** (`readlink` returns nothing).
- `node_modules/@aoc/protocol/package.json`: `"name": "@aoc/protocol"`, `"version": "0.1.0"`,
  `"types": "./dist/contracts/index.d.ts"`.
- `tsc --traceResolution` against both a root project (`tsconfig.src.json`) and a package project
  (`packages/agent-governance/tsconfig.json`) shows every `@aoc/protocol` import resolved to
  `node_modules/@aoc/protocol/dist/contracts/index.d.ts` with Package ID
  `@aoc/protocol/dist/contracts/index.d.ts@0.1.0` -- no `paths` alias pattern ever matched
  `@aoc/protocol`, and the trace contains zero occurrences of `types/aoc-protocol`.
- `types/aoc-protocol/index.d.ts` (the former ambient shim) and its `tsconfig.base.json` `paths`
  entry are deleted. The only remaining `aoc-protocol`-named path in the tree was
  `tests/fixtures/external-consumer/types/aoc-protocol/` (a second, narrower ambient shim used only
  by that fixture's own `tsconfig.json`); it has also been deleted, and that fixture now type-checks
  against the real installed package like any other consumer.

## Contract migrations (this sprint's application-level changes)

| Gap | Resolution |
| --- | --- |
| `AocIdentityClaims` not exported by Protocol | Replaced everywhere by the Enterprise-owned `VerifiedActorClaims` (`@aoc-enterprise/identity`, `{ readonly sub: string }`). All 8 real consumer files updated; zero imports of `AocIdentityClaims` from `@aoc/protocol` remain (enforced by `scripts/check-protocol-contract-adoption.mjs`). |
| `ScopedAccessRequest` shape mismatch (`.scope`/`.action` vs. real `principalId`/`resource`/`requestedScope`/`requestedAt`) | `src/runtime/host.ts` and `packages/control-plane/types.ts` migrated `.scope` -> `.requestedScope` (the real, sole canonical field). `.action` -- which never existed on the real contract in any form -- moved to the Enterprise-owned `EnterpriseScopedAccessRequest` extension (`@aoc-enterprise/scoped-access`, `interface EnterpriseScopedAccessRequest extends ScopedAccessRequest { readonly action?: string }`), composing rather than duplicating the real type. `resource` (real: `ResourceRef`) is compared via the explicit `legacyResourceIdentifier()` accessor (reconstructs Enterprise's legacy `kind:id` string form), not a cast. |
| `AuditEventEnvelope` field-naming divergence | `packages/control-plane/types.ts`'s `ControlPlaneAuditEvent` is now a standalone, Enterprise-owned legacy type (no longer `AuditEventEnvelope & {...}`). `packages/control-plane/audit-envelope-mapper.ts`'s `toProtocolAuditEventEnvelope()` is the sole, explicit, field-by-field boundary between the legacy snake_case shape and the real envelope -- no spread, no structural cast. The legacy persisted shape (`.aoc-control-plane.json`) and `ControlPlaneService`'s existing public methods are unchanged. |

## Validation battery (against the real, vendored `@aoc/protocol` tarball, in the tracked tree)

| Command | Result | Exit Code | Notes |
| --- | --- | --- | --- |
| `npm ci` | PASS | 0 | Installs the real tarball at `vendor/aoc-protocol-0.1.0.tgz`, plus the `@aoc-enterprise/identity`/`@aoc-enterprise/scoped-access` workspace packages. |
| `npm run typecheck` | PASS | 0 | Zero errors (down from the 18 documented in Phase A, all in the three categories above). |
| `npm run build` | PASS | 0 | |
| `npm run lint` | PASS | 0 | |
| `npm test` | PASS | 0 | 3,355 root tests + all workspace package tests (`identity`, `scoped-access`, `control-plane`, and pre-existing packages), 0 failures. |
| `npm run check:protocol-consumption` | PASS | 0 | |
| `npm run check:protocol-contract-adoption` | PASS | 0 | New this sprint -- forbids importing `AocIdentityClaims` from `@aoc/protocol` and forbids spread/cast in the audit mapper. |
| `npm run check:protocol-compatibility-lock` | PASS | 0 | |
| `npm run check:runtime-state` / `check:runtime-persistence` / `check:runtime-vault` | PASS | 0 | |
| `npm run check:aoc-boundaries` | PASS | 0 | |
| `npm run validate:publishability` | PASS | 0 | Detects the vendored tarball (not a sibling directory) and uses it directly; also packs and installs `@aoc-enterprise/identity`/`@aoc-enterprise/scoped-access` into the external-consumer fixture, since both now appear in the shipped public API surface. Scans 1,411 shipped JS artifacts, confirms zero runtime `@aoc/protocol` imports. |
| `npm run check:release-integrity` | PASS | 0 | |
| `npm run legal:check` | PASS | 0 | 2 pre-existing advisory findings, unrelated to Protocol (see below). |
| `npm run legal:check:strict` | **FAIL** | 1 | 1 pre-existing blocking finding (`busboy@1.6.0`, `streamsearch@1.1.0` missing license metadata) -- transitively pulled in by `next` via `apps/agent-passport-web`, **pre-existing, unrelated to this sprint, not remediated here** per the sprint's own scope rules. |
| `npm run validate:release` | PASS | 0 | Full aggregate gate. |

## Isolated tarball validation (canonical CI signal)

Run via `node scripts/protocol/validate-enterprise-against-protocol-tarball.mjs vendor/aoc-protocol-0.1.0.tgz`:

| Validation | Result |
| --- | --- |
| `npm install` (tarball-backed, fresh lockfile) | **PASS** |
| No sibling-path resolution in the resulting lockfile/`node_modules` | **PASS** |
| Installed `@aoc/protocol` identity | **PASS** (`@aoc/protocol@0.1.0`) |
| Resolve all 6 declared `@aoc/protocol` export subpaths | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run test` | **PASS** |
| `check:protocol-consumption` | **PASS** |
| `check:aoc-boundaries` | **PASS** |
| `validate:publishability` | **PASS** |
| `check:release-integrity` | **PASS** |
| Forbidden import scan | **PASS** |
| Declaration path leak scan | **PASS** |

`KNOWN_EXPORT_GAPS` in this validator script is now `{}` -- no ambient augmentation is written into
the isolated copy at all; every `@aoc/protocol` symbol Enterprise imports resolves from the real
installed tarball.

Incidentally, this sprint also fixed a **tooling bug** unrelated to any contract shape: the
validator's `run()` helper used `spawnSync` without a `maxBuffer`, which defaults to 1 MiB. The full
`npm run test` battery's combined TAP output exceeds that (now that this sprint added new test
suites), which silently killed the child process (`ENOBUFS`/`SIGTERM`, `status: null`) and was
reported as a failure with no useful diagnostic. Fixed by setting `maxBuffer: 64 * 1024 * 1024` in
all three `scripts/protocol*.mjs`/`scripts/validate-publishability.mjs` `run()` helpers.

## CI status

`.github/workflows/publishability.yml`'s `protocol-tarball-consumption` job is now **blocking**
(`continue-on-error` removed). It validates, on every PR and push to `main`/`master`: the pinned
Protocol commit, the tarball checksum against `protocol-consumer.lock.json`, the installed package
identity/version, absence of any ambient shim, absence of deep/source imports, `typecheck`,
`build`, `test`, `check:protocol-consumption`, `check:aoc-boundaries`, and `validate:publishability`.

## Negative-test evidence

- `tests/protocol-tarball-lock.test.mjs` (28 tests) -- Phase A infrastructure guards (lock format,
  pinned refs, checksum/commit/version mismatch, forbidden deep imports, sibling-path references,
  ambient `declare module '@aoc/protocol'` detection).
- `tests/protocol-contract-adoption.test.mjs` (new this sprint, 6 tests) -- fails if
  `AocIdentityClaims` is imported by name from `@aoc/protocol`, or if the audit mapper uses an
  object spread of the legacy event or a structural cast between `ControlPlaneAuditEvent` and
  `AuditEventEnvelope`.
- `src/runtime/__tests__/protocol-contract-adoption.test.ts` (new this sprint) -- compile-time
  `@ts-expect-error` governance: the real `ScopedAccessRequest` has no `.scope`/`.action`;
  `EnterpriseScopedAccessRequest` has both `.requestedScope` and `.action`; `VerifiedActorClaims`
  has no field beyond `.sub`. Enforced by `npm run typecheck`/`npm run build`, not by the test
  runner (an unused `@ts-expect-error` is itself a compile error).

## Runtime impact

- **Business logic:** unchanged. `host.ts`'s delegated-access authorization check (scope match,
  resource match, action match) produces identical `reasonCodes` for identical inputs; only the
  field names read (`.requestedScope` instead of `.scope`) and the resource-comparison mechanism
  (`legacyResourceIdentifier()` instead of a direct string compare) changed, not the outcome.
- **Public Enterprise APIs:** `ControlPlaneService`'s existing public methods are unchanged; the
  audit-envelope mapper is a new, additive, opt-in export, not a replacement of anything.
- **Persistence:** unchanged. `.aoc-control-plane.json`'s shape (`ControlPlaneAuditEvent`'s
  snake_case fields) is untouched; `toProtocolAuditEventEnvelope()` is a read-only, one-way
  conversion never written back to disk.
- **Protocol:** unchanged. No modification to `Architects_of_Change_Protocol`.
- **PMFreak:** unchanged. No file under any PMFreak-related path was touched.
- **Enterprise version:** unchanged (`1.0.0`).
- **Publication/release:** none performed. No package published, no release created, no tag
  created, no merge performed.
