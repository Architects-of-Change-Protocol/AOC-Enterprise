# Protocol Consumption Evidence — `@aoc/protocol@0.2.0-rc.0` (P0-PKG-02)

**Status: NOT PUBLISHED.** No `npm publish`, no registry configuration, no git tag, no GitHub
Release, no merge. Both packages remain `private: true`. This document records what was verified; it
authorizes nothing.

This is the candidate-specific companion to
[`PROTOCOL_CONSUMPTION_EVIDENCE.md`](./PROTOCOL_CONSUMPTION_EVIDENCE.md), which records the
historical `0.1.0` validation and is left byte-identical. Candidate evidence is written under the
candidate's own identity, never over a prior version's record.

## Frozen Protocol input — independently verified here

Every value below was **recomputed in this repository** from a tarball repacked from the pinned
Protocol source commit. None of it was copied from Protocol's evidence set.

| Field | Expected (frozen by P0-PKG-01) | Verified |
| --- | --- | --- |
| Package | `@aoc/protocol` | yes |
| Version | `0.2.0-rc.0` | yes |
| `private` | `true` | yes |
| Source commit | `dde34517d956156a0c735c18a805763a5e712879` | yes |
| Tarball | `aoc-protocol-0.2.0-rc.0.tgz` | yes |
| SHA-256 | `dbe8a08f432a0324ad34eb7cb85054b6dcd23c0d9a073914edf23fccd10445e5` | yes |
| SHA-512 | `f8cb8dd45bc656a2ab0ba8b01a80d6edad7291addb36088606a9ba4bf547c62333e32c137c6776ea308e25022673ecebabb6f797bfd580a22675132cdba90573` | yes |
| Size | 278,205 bytes | yes |
| File count | 407 | yes |
| Exports fingerprint | `a67d65b17dcb34c7da84d9a07cb893e073e21e9edbbc621bcae649afa5cdeb45` (15 keys) | yes |
| Integration contract | `aoc.cross-repository-integration@1.0.0`, `frozen` | yes |

### How it was obtained

A `git worktree` detached at `dde34517…`, confirmed clean (`git status --porcelain` empty), then this
repository's own documented procedure:

```bash
AOC_PROTOCOL_REPO=<clean worktree at dde34517…> \
AOC_PROTOCOL_REF=dde34517d956156a0c735c18a805763a5e712879 \
AOC_PROTOCOL_TARBALL_OUT=<out> \
  node scripts/protocol/build-protocol-tarball.mjs
```

The script re-verified the repository identity and that the checkout HEAD equals the pinned ref, then
`npm ci`, `npm run build --workspace @aoc/protocol`, `npm pack`. Result:
`sha256 = dbe8a08f…d10445e5`, matching the frozen value exactly.

The exports fingerprint was recomputed from the **packed artifact's own** `package.json` (not the
repository's), using the same canonical-ordering method Protocol uses:

```js
sha256(JSON.stringify(Object.keys(pkg.exports).sort().map((k) => [k, pkg.exports[k]])))
// => a67d65b17dcb34c7da84d9a07cb893e073e21e9edbbc621bcae649afa5cdeb45
```

Tarball contents are `dist/`, `package.json`, `README.md`, `LICENSE`, `NOTICE` and
`integration-contract.json` — no `src`, no tests, and **no Enterprise or PMFreak source**.

## The prerelease peer-range correction

`0.2.0-rc.0` does **not** satisfy `>=0.1.0` under npm semver. This was not a theoretical concern: it
was the single reason Frontera failed against the candidate.

| Command | Result |
| --- | --- |
| `semver.satisfies('0.2.0-rc.0', '>=0.1.0')` | `false` |
| clean external install of the runtime + candidate | `npm error code ERESOLVE` |

`scripts/protocol/validate-enterprise-against-protocol-tarball.mjs` against the candidate, **before**
the correction: 13 of 14 steps passed; the sole failure was `validate:publishability`, and its sole
cause was that ERESOLVE. After stating the range as `>=0.1.0 || >=0.2.0-rc.0`: **14 of 14**.

The correction admits no additional stable version and no other prerelease family — see
[`../integration/PROTOCOL_PACKAGE_CONSUMPTION.md`](../integration/PROTOCOL_PACKAGE_CONSUMPTION.md),
"Prerelease peer compatibility", for the full satisfaction table.

## Verification results

| Command | Result | Exit | Evidence |
| --- | --- | --- | --- |
| `npm ci` | PASS | 0 | Installs `vendor/aoc-protocol-0.2.0-rc.0.tgz`; `node_modules/@aoc/protocol` is a real directory, not a symlink |
| installed identity | PASS | — | `@aoc/protocol@0.2.0-rc.0`, ships `integration-contract.json` (`frozen`, `1.0.0`) |
| `npm run build` | PASS | 0 | |
| `npm run typecheck` | PASS | 0 | |
| `npm run lint` | PASS | 0 | |
| `npm test` | PASS | 0 | 4,565 tests |
| `npm run check:protocol-consumption` | PASS | 0 | |
| `npm run check:protocol-contract-adoption` | PASS | 0 | |
| `npm run check:protocol-compatibility-lock` | PASS | 0 | `@aoc/protocol@0.2.0-rc.0` pinned to `dde34517…` |
| `npm run protocol:tarball:verify-lock` | PASS | 0 | Built tarball matches the lock on commit, version and SHA-256 |
| `npm run protocol:tarball:validate` | PASS | 0 | **14/14** steps in an isolated copy |
| `npm run check:aoc-boundaries` | PASS | 0 | |
| `npm run validate:publishability` | PASS | 0 | 1,552 shipped JS artifacts contain no runtime `@aoc/protocol` import |
| `npm run check:release-integrity` | PASS | 0 | |
| `npm run validate:release` | **PASS** | 0 | Full gate |
| `npm run validate:v1-release` | PASS | 0 | Initially failed on a **pre-existing** stale `release/RELEASE_MANIFEST.json` checksum (reproduced identically on untouched `origin/main`); the manifest is the mutable current release manifest and was regenerated by P0-PKG-03, after which the full gate passes |

## Protocol ownership boundary

| Property | Result |
| --- | --- |
| Imports Protocol via package contract | **YES** — only `@aoc/protocol` and its declared subpaths |
| Redefines a protected Protocol symbol | **NO** — `check:protocol-consumption` scans for all 9 |
| Contains sibling-repository Protocol paths | **NO** — one stale spec found in the external-consumer fixture and removed; the gate now also scans package manifests, where the previous regex could not see it |
| Ships Protocol source | **NO** — the packed artifact matches `@aoc/protocol` zero times |
| Requires private/deep Protocol imports | **NO** — deep imports verified unresolvable in a clean room |
| Known gaps | none (`protocol-consumer.lock.json` → `knownGaps: []`) |

## Observed but deliberately not acted on

`@aoc/protocol@0.2.0-rc.0` adds export subpaths that `0.1.0` did not have, including `./identity`,
`./manifest` and `./sovereignty-capabilities`, which now provide `SovereignAssetId`,
`SovereignManifest`, `contentDigest` and `verifySovereignManifest`.

`src/enterprise/content-protection/sovereign-binding-port.ts` emits a reason string stating that the
vendored Protocol exports no such contract, and holds `SOVEREIGN_BINDING_GATE` at `BLOCKED_BY_PROTOCOL`.
Against the candidate that statement is now stale in fact.

It was **not** changed here. Acting on it would mean implementing sovereign binding — a semantic
feature change and a new capability — and the reason string is an emitted, serialized value.
`ALLOWED_PROTOCOL_SUBPATHS` was likewise left at the six subpaths Enterprise actually imports:
widening a consumption allowlist with no consumer would weaken the check for nothing. This is
recorded as a follow-up, not a defect of this increment.
