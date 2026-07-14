# Protocol Consumption Evidence

Evidence captured for the Versioned Protocol Consumption Sprint. This is a point-in-time record;
re-run the commands below to refresh it after any change to `protocol-consumer.lock.json`.

## Protocol artifact

| Field | Value |
| --- | --- |
| Protocol repository | `Architects-of-Change-Protocol/Architects_of_Change_Protocol` |
| Protocol commit | `7049fadb6144808b78c5102fce490feba324b80f` (merge of PR #314, "feat(protocol): make @aoc/protocol externally consumable") |
| Protocol package | `@aoc/protocol` |
| Protocol package version | `0.1.0` |
| Tarball filename | `aoc-protocol-0.1.0.tgz` |
| Tarball size | 35,117 bytes |
| SHA-256 (not a cryptographic signature — a content-integrity checksum) | `4372293666fbec2bd1add4852c0d6f907790776e0001ea93d081888bcc1c9069` |
| Build reproducibility | Built twice from the same pinned commit; SHA-256 identical both times |
| Protocol's own consumer/package validation | `npm run protocol:consumer:check` (typescript-cjs, javascript-cjs, typescript-esm fixtures) — **PASSED** |

## Enterprise commit under validation

| Field | Value |
| --- | --- |
| Enterprise repository | `Architects-of-Change-Protocol/AOC-Enterprise` |
| Enterprise commit | `7906b28f1fc6d886d36b70fe48254183db6ac6e5` (branch base, before this sprint's changes) |
| Node version | v22.22.2 |
| npm version | 10.9.7 |

## Existing validation battery (against the local ambient shim, unaffected by this sprint)

Run before any change, to establish the pre-sprint baseline, and re-run after this sprint's changes
to confirm no regression:

| Command | Result | Exit Code | Notes |
| --- | --- | --- | --- |
| `npm ci` | PASS | 0 | Leaves a dangling `node_modules/@aoc/protocol` symlink to the (absent) sibling path; harmless, never resolved by the actual build. |
| `npm run typecheck` | PASS | 0 | Resolves `@aoc/protocol` via the local ambient shim (`types/aoc-protocol/index.d.ts`), not the real package. |
| `npm run build` | PASS | 0 | Same as above. |
| `npm run lint` | PASS | 0 | |
| `npm test` | PASS | 0 | 268/268 tests. |
| `npm run check:protocol-consumption` | PASS | 0 | Strengthened this sprint; see "Protocol consumption changes" below. |
| `npm run check:protocol-compatibility-lock` | PASS | 0 | New this sprint. |
| `npm run check:aoc-boundaries` | PASS | 0 | |
| `npm run validate:publishability` | PASS | 0 | Falls back to `tests/fixtures/protocol-stub`; scans 1,410 shipped JS artifacts, confirms zero runtime `@aoc/protocol` imports. |
| `npm run check:release-integrity` | PASS | 0 | |
| `npm run legal:check` | PASS | 0 | 2 pre-existing advisory findings, unrelated to Protocol. |
| `npm run legal:check:strict` | **FAIL** | 1 | 1 pre-existing blocking finding (`busboy@1.6.0`, `streamsearch@1.1.0` missing license metadata in the lockfile) — **pre-existing, unrelated to this sprint, not remediated here** per the sprint's own scope rules. |
| `npm run validate:release` | PASS | 0 | Full aggregate gate, unaffected by this sprint's changes. |

## Isolated tarball validation (against the real, pinned `@aoc/protocol` package)

Run via `node scripts/protocol/validate-enterprise-against-protocol-tarball.mjs <tarball>` — a
throwaway temp copy of the repository, `@aoc/protocol` installed from the real tarball, local
ambient shim narrowed to only the documented `AocIdentityClaims` export gap:

| Validation | Result | Evidence |
| --- | --- | --- |
| `npm install` (tarball-backed, fresh lockfile) | **PASS** | Installs cleanly with no sibling-path dependency. |
| No sibling-path resolution in the resulting lockfile/`node_modules` | **PASS** | `node_modules/@aoc/protocol` is a real extracted install from the tarball, not a symlink. |
| Installed `@aoc/protocol` identity | **PASS** | `@aoc/protocol@0.1.0`. |
| Resolve all 6 declared `@aoc/protocol` export subpaths | **PASS** | `@aoc/protocol`, `/contracts`, `/errors`, `/claims`, `/adapters`, `/runtime-registry` all resolve via `import.meta.resolve`. |
| `npm run typecheck` | **FAIL** | 3 files fail on `AocIdentityClaims` (documented gap #1); 2 files fail on `ScopedAccessRequest` shape (gap #2); `packages/control-plane/service.ts`/`types.ts` fail on `AuditEventEnvelope` shape (gap #3). See `docs/integration/PROTOCOL_PACKAGE_CONSUMPTION.md` → "Known gaps". |
| `npm run build` | **FAIL** | Same root causes as typecheck (`tsc -b`). |
| `npm run lint` | **PASS** | Architecture/public-surface/Node16-import lint is independent of Protocol's real shapes. |
| `npm test` | **FAIL** | `npm test` runs `npm run build` first; fails for the same reason as build. |
| `check:protocol-consumption` | **PASS** | Import-boundary/allowlist/sibling-path checks pass; this check does not typecheck contract shapes. |
| `check:aoc-boundaries` | **PASS** | |
| `validate:publishability` | **FAIL** | Its internal `npm run build` step fails for the same underlying reason as the top-level build. |
| `check:release-integrity` | **PASS** | |
| Forbidden import scan (deep imports, protocol source imports) | **PASS** | Zero violations in `src`, `packages`, `tests`, `types` (the validator's own tooling under `scripts/protocol/` is excluded from this scan; it legitimately contains the literal patterns it exists to detect). |
| Declaration path leak scan | **PASS** | No shipped `.d.ts` leaks a local/temp filesystem path. |

**Interpretation:** the packaging/tooling infrastructure this sprint built (tarball build,
tarball-backed isolated install, sibling-path independence, public-export resolution, lint,
boundary checks, release-integrity, publishability's non-build assertions) is fully green.
`typecheck`/`build`/`test`/`validate:publishability`'s build step fail specifically and only
because of the 3 documented, pre-existing contract-shape gaps between Enterprise's application code
and the real Protocol package (see `docs/integration/PROTOCOL_PACKAGE_CONSUMPTION.md` → "Known
gaps") — not because of anything related to packaging, sibling-path coupling, or forbidden imports.
This is reported here exactly as observed; it is not hidden, `skipLibCheck`'d away, or worked around.

## Negative-test evidence

`tests/protocol-tarball-lock.test.mjs` (28 tests, all passing) exercises the failure modes required
by the sprint: missing/malformed lock fields, non-full/mutable commit refs, commit mismatch,
checksum mismatch, package-name mismatch, version mismatch, forbidden `/src` and `/dist` deep
imports, sibling-path references, and ambient `declare module '@aoc/protocol'` detection.

## Runtime impact

- **Runtime changes:** none. Every `@aoc/protocol` import in Enterprise source is `import type`,
  erased at compile time; `validate:publishability` independently confirms zero runtime
  `require('@aoc/protocol')`/`from '@aoc/protocol'` across 1,410 shipped JS artifacts.
- **API changes:** none. No public Enterprise export was added, removed, or changed.
- **Schema/contract changes:** none. No Protocol contract was copied, modified, or redefined
  beyond the pre-existing, now-documented local ambient shim.
- **Persistence changes:** none.
- **Deployment changes:** none.
- **Enterprise version:** unchanged (`1.0.0`).
- **Protocol version:** not changed by this repository (Protocol's version is `0.1.0`, set by
  Protocol's own repository).

This sprint's result is packaging/integration tooling plus documentation of pre-existing
application-level compatibility gaps — not a runtime or contract change.
