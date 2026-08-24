# Frontera Runtime Candidate Evidence — `@aoc-enterprise/runtime@1.0.0` (P0-PKG-02)

**Status: NOT PUBLISHED.** No `npm publish`, no registry configuration, no git tag, no GitHub
Release, no merge, no auto-merge. `package.json` remains `"private": true`. This document records
the identity of a produced artifact and a blocking finding about it; it authorizes nothing.

**Overall verdict: BLOCKED.** The artifact is reproducible and its Protocol compatibility is proven,
but it is **not self-contained**: 3 of its 10 declared exports cannot be loaded by an external
consumer. See [Blocking finding](#blocking-finding).

## Artifact identity

| Field | Value |
| --- | --- |
| Human product | Frontera |
| Technical package | `@aoc-enterprise/runtime` |
| Version | `1.0.0` (`private: true`) |
| Source repository | `Soberania-Protocol/Soberania-Enterprise` |
| **Source commit** | `65db731e24a67fd5850ce29092e39a175f890211` |
| Source tree | `d33a945463cede5a81c7fcccaebc874de3c2fc1a` |
| Tarball | `aoc-enterprise-runtime-1.0.0.tgz` |
| **SHA-256** | `93b9d9f13bf908eeb7a1e62c24b6207fa6d9dd212faa0b5295cdb065e79b4e63` |
| SHA-512 | `648f15c3d26393c56d24cdeecdaab4d8179c749e44baabcb9661ceddc5deeb2538546639bca13f7c86c6493722c2a65ec469ffe1014559f35e511066cf7913ca` |
| npm integrity | `sha512-ZI8Vw9Jjk8VtJM3uzaq02BecdJ5EuqvLlmHO3cXe6yU4VGY5vKE/fIbGSTciwqZexGn/4QFFWfNeURBmz3kTyg==` |
| Size | 3,244,268 bytes |
| File count | 6,212 |
| Unpacked size | 18,523,323 bytes |
| **Exports fingerprint** | `2b0ee1e3afee7c02d600615771eac3fa8aeec680c27bf4189041715729a22438` (10 keys) |
| Node | `>=22` (built and packed on `v22.22.2`, npm `10.9.7`) |
| Module format | CommonJS |
| Manifest | [`../../release/frontera-candidate-manifest-1.0.0.json`](../../release/frontera-candidate-manifest-1.0.0.json) |
| SBOM | [`../../release/frontera-candidate-1.0.0.sbom.spdx.json`](../../release/frontera-candidate-1.0.0.sbom.spdx.json) |
| Integration lock | [`../../enterprise-integration.lock.json`](../../enterprise-integration.lock.json) |

## Why the version is still `1.0.0`

The packed bytes changed (package.json is inside the tarball), so this had to be justified rather
than assumed.

- The package is `"private": true` and has **never been published** to any registry. `1.0.0` is a
  source milestone, not a distributed immutable artifact.
- `main` has already drifted from tag `v1.0.0` while holding the version at `1.0.0`. The diff
  `v1.0.0 → origin/main` includes changes to `dependencies` (adding `@aoc-enterprise/identity` and
  `@aoc-enterprise/scoped-access`) and to this very field —
  `devDependencies["@aoc/protocol"]` moved from a sibling source path to the vendored tarball.
- This increment's change is strictly narrower than that precedent: same field, same class, no
  dependency added or removed, no export changed.

Inventing `1.0.1`, `1.1.0` or `1.0.1-rc.0` would have had no basis in repository evidence, so the
existing identity stands.

## What actually changed in the artifact

Packed against a baseline pack taken from `origin/main` before any edit:

```text
file listings           identical (6,212 entries both)
dist/ (6,209 files)     BYTE-IDENTICAL
package.json            2 lines differ
```

```diff
-    "@aoc/protocol": ">=0.1.0",
+    "@aoc/protocol": ">=0.1.0 || >=0.2.0-rc.0",
-    "@aoc/protocol": "file:./vendor/aoc-protocol-0.1.0.tgz",
+    "@aoc/protocol": "file:./vendor/aoc-protocol-0.2.0-rc.0.tgz",
```

Runtime behavior, business semantics and the public export surface are therefore unchanged as a
matter of bytes, not assertion.

## Reproducibility

Two independent packs, from two `git worktree`s detached at the source commit, in **different
directories**, each `npm ci` → `npm run build` → `npm pack`:

| | Pack A | Pack B |
| --- | --- | --- |
| Source commit | `65db731e…` | `65db731e…` |
| SHA-256 | `93b9d9f13bf908eeb7a1e62c24b6207fa6d9dd212faa0b5295cdb065e79b4e63` | `93b9d9f13bf908eeb7a1e62c24b6207fa6d9dd212faa0b5295cdb065e79b4e63` |
| Size | 3,244,268 | 3,244,268 |
| File count | 6,212 | 6,212 |

**Comparison: MATCH** — byte-identical, and file listings identical. A third pack produced
independently by `check:clean-room-consumer` reported the same SHA-256.

## Package-content integrity

Top-level entries: `dist/`, `package.json`, `README.md`, `LICENSE`.

| Checked for | Result |
| --- | --- |
| Protocol source | absent — the artifact matches `@aoc/protocol` zero times |
| Vendored Protocol tarball | absent — Protocol is a dependency, not embedded content |
| PMFreak source | absent — the only `pmfreak` matches are Enterprise-authored files under `dist/src/features/aoc-integrations/`, compiled from this repository's own `src/` |
| `.env`, keys, `.git`, images, traces | absent |
| Absolute or repository-local paths | absent |
| `NOTICE` | **absent — pre-existing.** `files: ["dist"]` and npm's implicit includes do not pick up the root `NOTICE.md`. The baseline pack from `origin/main` is identical in this respect; not introduced here, and changing `files` would alter the artifact for a non-Protocol reason |
| Compiled `*.test.js` | **present — pre-existing.** `tsc` emits tests into `dist/`; identical in the baseline pack |

## Public export surface

Measured as the canonically ordered `exports` object, before and after:

| | `origin/main` | this branch |
| --- | --- | --- |
| Keys | 10 | 10 |
| Fingerprint | `2b0ee1e3afee7c02…` | `2b0ee1e3afee7c02…` |

**Unchanged.** `name`, `version`, `private`, `main`, `types`, `engines`, `files` and `dependencies`
are all unchanged as well.

## Clean-room external consumer

`npm run check:clean-room-consumer` builds and packs the runtime plus its two declared workspace
dependencies, installs them together with the pinned Protocol candidate into a throwaway package
created **outside this repository**, and then loads every declared export.

No workspace links, no `file:` path into any source tree, no `--force`, no `--legacy-peer-deps`.

| Check | Result |
| --- | --- |
| Vendored Protocol tarball matches the lock SHA-256 | PASS |
| `npm install` resolves under strict peer semantics | **PASS** (this is what the peer-range correction bought) |
| Resolved Frontera version | `1.0.0` |
| Resolved Protocol version | `0.2.0-rc.0` |
| Resolved Frontera path | inside the clean room, not this repository |
| Resolved Protocol path | inside the clean room, not a Protocol checkout |
| Installed `@aoc/protocol` is a real directory, not a symlink | PASS |
| Installed Protocol ships `integration-contract.json` (`frozen`, `1.0.0`) | PASS |
| Representative runtime execution through the packaged surface | PASS |
| Negative imports (`/src/index`, `/dist/src/index.js`, `/internal`, `@aoc/protocol/src/index`, `@aoc/protocol/dist/contracts/index.js`) | all unresolvable — PASS |
| Typecheck of all 10 exports against shipped declarations | **FAIL** (2 errors) |
| Load all 10 exports | **FAIL** (7 pass, 3 fail) |

### Blocking finding

**`@aoc-enterprise/runtime` is not self-contained.** Its shipped `dist/` requires 13
`@aoc-enterprise/*` workspace packages at runtime, of which only two —
`@aoc-enterprise/identity` and `@aoc-enterprise/scoped-access` — are declared in `dependencies`.

| Export | External consumer |
| --- | --- |
| `@aoc-enterprise/runtime` | loads |
| `@aoc-enterprise/runtime/authorization` | loads |
| `@aoc-enterprise/runtime/audit` | loads |
| `@aoc-enterprise/runtime/crypto` | loads |
| `@aoc-enterprise/runtime/adapters` | loads |
| `@aoc-enterprise/runtime/runtime` | loads |
| `@aoc-enterprise/runtime/runtime-host` | loads |
| `@aoc-enterprise/runtime/kernel` | **fails** — `Cannot find module '@aoc-enterprise/governed-authority'` |
| `@aoc-enterprise/runtime/enterprise` | **fails** — same |
| `@aoc-enterprise/runtime/kernel-host` | **fails** — same |

It also leaks into the shipped declarations:

```text
dist/src/kernel/contracts/ports.d.ts(1,120): TS2307: Cannot find module '@aoc-enterprise/governed-authority'
dist/src/kernel/contracts/kernel-request.d.ts(1,61): TS2307: Cannot find module '@aoc-enterprise/governed-authorization'
```

Undeclared but required at runtime: `access-grant`, `agent-governance`,
`collateralization-mandate`, `governed-authority`, `governed-authorization`, `grant-revocation`,
`license-mandate`, `pinata-adapter`, `pmfreak-agent-passport-foundation`, `provider-adapter`,
`provider-translation`, `tokenization-mandate`, `transfer-mandate`.

**This is pre-existing.** `dist/` is byte-identical to the pre-change baseline and `dependencies` is
untouched, so nothing in this increment caused or worsened it.

**Why it is not a one-line fix.** All 13 are `private: true`, and they depend on each other through
`file:../<sibling>` specifiers that resolve only inside this monorepo. Adding them to `dependencies`
does not make them installable by an external consumer — npm cannot resolve a packed tarball's
`file:../resource-envelope`. The real options are (a) `bundledDependencies`, (b) inlining them into
`dist` at build time, (c) publishing them as real packages and replacing the `file:../` specifiers,
or (d) narrowing the public export surface. Each changes the artifact shape or the public API, and
each needs its own approved increment.

**Why the existing gates miss it.** `scripts/validate-publishability.mjs` calls
`import.meta.resolve()` on the export specifiers — which answers "does a file exist at this path"
without ever executing the module — and its fixture imports only 3 of the 10 exports. A
shipped-but-undeclared dependency is invisible to resolution and surfaces only on load. That is the
gap `check:clean-room-consumer` closes.

**CI wiring.** `check:clean-room-consumer` is deliberately **not** wired into `validate:release` or
CI in this increment. It fails today, on the pre-existing defect it was written to expose; wiring it
now would turn CI red for everyone without fixing anything, and weakening it to pass would defeat
its purpose. Wire it in the increment that closes the finding.

## Verification summary

| Command | Result | Exit |
| --- | --- | --- |
| `npm ci` | PASS | 0 |
| `npm run build` | PASS | 0 |
| `npm run typecheck` | PASS | 0 |
| `npm run lint` | PASS | 0 |
| `npm test` | PASS (4,565 tests) | 0 |
| `npm run validate:release` | **PASS** | 0 |
| `npm run protocol:tarball:validate` | **PASS (14/14)** | 0 |
| `npm run protocol:tarball:verify-lock` | PASS | 0 |
| `npm run check:protocol-compatibility-lock` | PASS | 0 |
| `npm run validate:publishability` | PASS | 0 |
| `npm run check:release-integrity` | PASS | 0 |
| `npm pack` ×2 reproducibility | **MATCH** | 0 |
| `npm run check:clean-room-consumer` | **FAIL** — 7/10 exports consumable | 1 |
| `npm run validate:v1-release` | FAIL — pre-existing stale `release/RELEASE_MANIFEST.json`, reproduced on untouched `origin/main` | 1 |

## Statuses

```text
publication_status:                  NOT_PUBLISHED
tag_status:                          NOT_CREATED
release_status:                      NOT_CREATED
pmfreak_integration_status:          NOT_TESTED_IN_THIS_INCREMENT
three_repository_integration_status: NOT_TESTED_IN_THIS_INCREMENT
```
