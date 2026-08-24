# Frontera Runtime Candidate Evidence — `@aoc-enterprise/runtime@1.0.0` (P0-PKG-02 + P0-PKG-03)

**Status: NOT PUBLISHED.** No `npm publish`, no registry configuration, no git tag, no GitHub
Release, no merge, no auto-merge. `package.json` remains `"private": true`. This document records
the identity of a produced artifact; it authorizes nothing.

**Overall verdict: PASS.** The artifact is reproducible, its Protocol compatibility is proven, and —
as of P0-PKG-03 — it is **self-contained**: a clean external consumer installing only this artifact
and the frozen Protocol candidate loads all ten declared exports and typechecks them with
`skipLibCheck: false`. The P0-PKG-02 revision of this document recorded a **BLOCKED** verdict for
this candidate line; that finding is closed and the superseded measurement is preserved
[below](#superseded-candidate-p0-pkg-02-blocked).

## Artifact identity

| Field | Value |
| --- | --- |
| Human product | Frontera |
| Technical package | `@aoc-enterprise/runtime` |
| Version | `1.0.0` (`private: true`) |
| Source repository | `Soberania-Protocol/Soberania-Enterprise` |
| **Source commit** | `11edd06e7d6ea38ae0bc037e91854444b84a50a7` |
| Source tree | `6ab9b36d0bd1169ab6cc9955e109ed974ebe623d` |
| Tarball | `aoc-enterprise-runtime-1.0.0.tgz` |
| **SHA-256** | `53d9e6ce4f3ba8fd82bbd90ebe5bc53f8bffb597b0d11bfd22d9a1ba5245a2de` |
| SHA-512 | `bbf9f4780d373797a384e10c41c9546dcedcd2249b937c8485045c6e7b1ac6bade6b690234630f63ae32d0bd8f3a726347be851c7b28010e77629a3e3cc18eb9` |
| npm integrity | `sha512-u/n0eA03N5ejhOEMQclUbc7c0iSbk3yEhQRcbnsaxrrea2kCNGMPY64y0L2POnJjR76FHHsoAQ53Ypo+PMGOuQ==` |
| Size | 3,303,573 bytes |
| File count | 6,298 |
| Unpacked size | 18,732,235 bytes |
| **Exports fingerprint** | `2b0ee1e3afee7c02d600615771eac3fa8aeec680c27bf4189041715729a22438` (10 keys, unchanged since `origin/main`) |
| Bundling mode | npm `bundleDependencies` (Option A — see the [ADR](../architecture/ADR-FRONTERA-SELF-CONTAINED-PACKAGING.md)) |
| Bundled internal modules | 4: `governed-authority`, `governed-authorization`, `identity`, `scoped-access` — all remain `private: true` |
| Node | `>=22` (built and packed on `v22.22.2`, npm `10.9.7`) |
| Module format | CommonJS |
| Manifest | [`../../release/frontera-candidate-manifest-1.0.0.json`](../../release/frontera-candidate-manifest-1.0.0.json) |
| SBOM | [`../../release/frontera-candidate-1.0.0.sbom.spdx.json`](../../release/frontera-candidate-1.0.0.sbom.spdx.json) |
| Integration lock | [`../../enterprise-integration.lock.json`](../../enterprise-integration.lock.json) |

## Why the version is still `1.0.0`

The package is `"private": true` and has **never been published**; `1.0.0` is a source milestone,
not a distributed immutable artifact. `main` had already drifted from tag `v1.0.0` while holding the
version at `1.0.0` — including changes to `dependencies` and to the `@aoc/protocol` devDependency —
so both the P0-PKG-02 metadata change and the P0-PKG-03 packaging change sit inside that
established precedent. No repository evidence authorizes inventing `1.0.1`/`1.1.0`, and no immutable
`1.0.0` artifact exists anywhere to conflict with.

## What P0-PKG-03 changed in the artifact

Relative to the P0-PKG-02 candidate (which was itself byte-identical to `origin/main` in all of
`dist/`):

```text
dist/ (6,209 files)                 BYTE-IDENTICAL — no compiled output changed
package.json                        dependencies gained governed-authority and
                                    governed-authorization ("*", repository convention);
                                    bundleDependencies added (4 private modules)
node_modules/@aoc-enterprise/*      NEW: 86 files — the four bundled private modules,
                                    each restricted by its own files:["dist"]
```

No file under `src/` or `packages/*/src` changed. The one manifest edit outside the root —
`packages/governed-authority/package.json` — replaced `"file:../governed-authorization"` with `"*"`
(the convention the root package already uses for every workspace dependency), because the `file:`
form desynchronised an external consumer's lockfile and broke `npm ci` there. Workspace resolution
links the packages inside the monorepo either way; behavior is unchanged.

## Reproducibility

Two independent packs, from two `git worktree`s detached at the source commit, in **different
directories**, each `npm ci` → `npm run build` → `npm pack`:

| | Pack A | Pack B |
| --- | --- | --- |
| Source commit | `11edd06e…` | `11edd06e…` |
| SHA-256 | `53d9e6ce4f3ba8fd82bbd90ebe5bc53f8bffb597b0d11bfd22d9a1ba5245a2de` | `53d9e6ce4f3ba8fd82bbd90ebe5bc53f8bffb597b0d11bfd22d9a1ba5245a2de` |
| Size | 3,303,573 | 3,303,573 |
| File count | 6,298 | 6,298 |

**Comparison: MATCH** — byte-identical, file listings identical. A third pack produced independently
by `check:clean-room-consumer` at the same commit reported the same SHA-256.

## Package-content integrity

Top-level entries: `dist/` (6,209), `node_modules/` (86 — the bundled private modules),
`package.json`, `README.md`, `LICENSE`.

| Checked for | Result |
| --- | --- |
| Protocol source | absent — the artifact matches `@aoc/protocol` zero times |
| Vendored Protocol tarball | absent — Protocol is an external peer, not embedded content |
| PMFreak source | absent |
| `src/`, tests, `tsconfig*`, build info inside the bundled modules | absent — npm honoured each bundled package's `files: ["dist"]` |
| Native binaries / `better-sqlite3` payloads | absent — third-party deps install normally from a registry |
| `.env`, keys, `.git`, images, traces | absent |
| Absolute or repository-local paths | absent |
| `file:` specifiers requiring consumer-side resolution | none — verified by `npm ci --offline` in the clean room |
| `NOTICE` | absent — **pre-existing** (`files: ["dist"]` has never picked up the root `NOTICE.md`); unchanged by both increments |
| Compiled `*.test.js` under `dist/` | present — **pre-existing**; identical to the `origin/main` baseline |

## Clean-room external consumer — the acceptance gate

`npm run check:clean-room-consumer` (wired into `validate:release`, `validate:v1-release`, and the
blocking `clean-room-consumer` CI job) installs the packed artifact plus the pinned Protocol
candidate into a throwaway package outside this repository — **and nothing else** — then proves the
final architecture. **40/40 checks pass.**

| Check | Result |
| --- | --- |
| Consumer manifest declares only `@aoc-enterprise/runtime` and `@aoc/protocol` | PASS (asserted, not assumed) |
| `npm install` under strict peer semantics (no `--force`, no `--legacy-peer-deps`) | PASS |
| `npm ci --offline` reinstall from the generated lockfile | PASS — lockfile coherent; zero registry lookups for private modules |
| TypeScript, `skipLibCheck: false`, importing all 10 exports | PASS, zero errors |
| **All 10 exports load** — root, `/authorization`, `/audit`, `/crypto`, `/adapters`, `/runtime`, `/runtime-host`, `/kernel`, `/enterprise`, `/kernel-host` | **PASS — 10/10** |
| Representative runtime execution through the packaged surface | PASS |
| Resolved Frontera `1.0.0` / Protocol `0.2.0-rc.0`, both inside the clean room | PASS |
| No private `@aoc-enterprise/*` installed alongside the runtime | PASS |
| Artifact carries exactly its 4 private modules, each a real directory, each still `private: true` | PASS |
| Installed Protocol is a real directory shipping its frozen `integration-contract.json` | PASS |
| Deep/undeclared imports (5 negative cases) | all unresolvable — PASS |

## Verification summary (at the source commit)

| Command | Result | Exit |
| --- | --- | --- |
| `npm ci` / `npm run build` / `typecheck` / `lint` | PASS | 0 |
| `npm test` | PASS (4,565 tests) | 0 |
| `npm run validate:release` (now includes the clean-room gate) | **PASS** | 0 |
| `npm run validate:v1-release` (now includes the clean-room gate) | **PASS** — first pass in this candidate line | 0 |
| `npm run protocol:tarball:validate` | **PASS (14/14)** | 0 |
| `npm run protocol:tarball:verify-lock` / `check:protocol-compatibility-lock` | PASS | 0 |
| `npm run validate:publishability` (no longer injects workspace tarballs) | PASS | 0 |
| `npm run check:release-integrity` | PASS | 0 |
| `npm run check:clean-room-consumer` | **PASS (40/40)** | 0 |
| `npm pack` ×2 reproducibility | **MATCH** | 0 |

`release/RELEASE_MANIFEST.json` was classified as the repository's **mutable current release
manifest** (machine-generated by `generate-release-manifest.mjs`; freshness enforced by
`verify-release-manifest.mjs`, whose own error text instructs regeneration) — not historical
immutable evidence — and was regenerated. Its single stale checksum predated P0-PKG-02 and
reproduced on untouched `origin/main`.

## Superseded candidate (P0-PKG-02, BLOCKED)

Preserved for the record; this artifact was never merged, never published, and is superseded:

| Field | Value |
| --- | --- |
| Source commit | `65db731e24a67fd5850ce29092e39a175f890211` |
| SHA-256 | `93b9d9f13bf908eeb7a1e62c24b6207fa6d9dd212faa0b5295cdb065e79b4e63` |
| Size / files | 3,244,268 bytes / 6,212 |
| Verdict | **BLOCKED** — not self-contained: `/kernel`, `/enterprise`, `/kernel-host` failed to load externally (`Cannot find module '@aoc-enterprise/governed-authority'`); 7/10 exports consumable; two shipped declarations referenced undeclared modules |

The measured closure that fixed it: from the ten public export entry points, the real dependency
closure is **four** private packages (runtime closure two, declaration closure four), not the
thirteen a whole-of-`dist` grep suggested. Full analysis and the decision record are in
[`../architecture/ADR-FRONTERA-SELF-CONTAINED-PACKAGING.md`](../architecture/ADR-FRONTERA-SELF-CONTAINED-PACKAGING.md).

## Deferred, deliberately untouched

Protocol `0.2.0-rc.0` ships sovereign-asset contracts (`SovereignAssetId`, `SovereignManifest`,
`verifySovereignManifest`) that `0.1.0` lacked, so the `SOVEREIGN_BINDING_GATE =
BLOCKED_BY_PROTOCOL` reason string emitted by
`src/enterprise/content-protection/sovereign-binding-port.ts` is now stale in fact. Acting on it
means implementing sovereign binding — a semantic feature change on an emitted, serialized value —
which is not a packaging defect and remains out of scope for this candidate line.

## Statuses

```text
publication_status:                  NOT_PUBLISHED
tag_status:                          NOT_CREATED
release_status:                      NOT_CREATED
pmfreak_integration_status:          NOT_TESTED_IN_THIS_INCREMENT
three_repository_integration_status: NOT_TESTED_IN_THIS_INCREMENT
```
