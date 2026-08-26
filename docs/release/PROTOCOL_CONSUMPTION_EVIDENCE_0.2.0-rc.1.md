# Protocol Consumption Evidence — `@aoc/protocol@0.2.0-rc.1` (P0-PKG-08)

**Status: NOT PUBLISHED.** No `npm publish`, no registry configuration, no dist-tag, no git tag, no
GitHub Release, no merge. Both packages remain `private: true`. This document records what was
verified; it authorizes nothing.

This is the candidate-specific companion to
[`PROTOCOL_CONSUMPTION_EVIDENCE_0.2.0-rc.0.md`](./PROTOCOL_CONSUMPTION_EVIDENCE_0.2.0-rc.0.md) (the
burned candidate) and [`PROTOCOL_CONSUMPTION_EVIDENCE.md`](./PROTOCOL_CONSUMPTION_EVIDENCE.md) (the
historical `0.1.0` validation). Both are left byte-identical. Candidate evidence is written under the
candidate's own identity, never over a prior version's record — including when that prior candidate
turns out to have been defective.

## Why `0.2.0-rc.0` is burned

`@aoc/protocol@0.2.0-rc.0`'s canonical-JSON writer truncated exponent digits. Executed against the
exact artifact this repository had vendored (`vendor/aoc-protocol-0.2.0-rc.0.tgz`):

| Input | rc.0 canonical form | rc.1 canonical form |
| --- | --- | --- |
| `7.9e-10` | `"7.9e-1"` | `"7.9e-10"` |
| `7.9e-100` | `"7.9e-1"` | `"7.9e-100"` |
| `1.5e-300` | `"1.5e-3"` | `"1.5e-300"` |

Two distinct numbers with one canonical form is one digest for two values. Anything whose integrity
rests on a canonical digest inherits that collision, so the candidate is unusable rather than merely
imprecise, and the defect is wider than the pair originally reported. Soberanía Protocol declared the
candidate **BURNED** rather than repacking its bytes under the same identity — replacing an immutable
candidate's bytes would have falsified every record already written against it — and cut
`0.2.0-rc.1` from commit `eec79cdd4019dd42e1767909c5bd4e26d04c6f0f` as the repaired successor.

**Frontera did not bundle this defect.** The Frontera artifact ships no Protocol code (`files:
["dist"]`; `@aoc/protocol` is an external peer dependency for every consumer), and this repin changes
no compiled output — every `dist` checksum in `release/RELEASE_MANIFEST.json` is unchanged across it.
What the burn invalidated is Frontera's *compatibility evidence*: candidates up to and including
`1.2.0` were validated and handed off against an input later declared burned. See
[`frontera-candidate-manifest-1.2.1.json`](../../release/frontera-candidate-manifest-1.2.1.json).

## Repaired Protocol input — independently verified here

Every value below was **recomputed in this repository** from a tarball repacked from the pinned
Protocol source commit. None of it was copied from Protocol's evidence set; the agreement with that
set is the result, not the method.

| Field | Expected | Verified |
| --- | --- | --- |
| Package | `@aoc/protocol` | yes |
| Version | `0.2.0-rc.1` | yes |
| `private` | `true` | yes |
| Source commit | `eec79cdd4019dd42e1767909c5bd4e26d04c6f0f` | yes |
| Tarball | `aoc-protocol-0.2.0-rc.1.tgz` | yes |
| SHA-256 | `b0d6ee6ff2010c4addab0bd683e2a89b9b2246f430c7e892fdc3d4123f3a3f60` | yes |
| SHA-512 | `889aa0c28f592dec16858e0758e5f5a307e99603b37239360ae3ce708ee77bc661c0cf1d7a40daced6818647e0a2cd0843d9921fa7e679f340db28b1f033b66c` | yes |
| npm integrity | `sha512-iJqgwo9ZLewWhY4HWOX1owfplgOzcjk2CuPOcI7ne8ZhwM8dekDaztaBhkfgos0IQ9mSH6fmefNA2yix8DO2bA==` | yes |
| Size | 280,149 bytes | yes |
| File count | 407 | yes |
| Exports fingerprint | `a67d65b17dcb34c7da84d9a07cb893e073e21e9edbbc621bcae649afa5cdeb45` (15 keys) | yes |
| Integration contract | `aoc.cross-repository-integration@1.0.1`, `frozen` | yes |

### How it was obtained

**The Windows `/mnt/c` DrvFs checkout was deliberately not used to derive these bytes.** Protocol's
own P0-CANON-02 established that DrvFs alters tar metadata and can produce a different SHA-256 from
identical source. A clean clone was made on a genuine Linux filesystem (`ext4`, under `/home`),
checked out detached at the pinned commit and confirmed clean (`git status --porcelain` empty), then
this repository's own documented procedure was run against it:

```bash
AOC_PROTOCOL_REPO=<clean ext4 clone at eec79cdd…> \
AOC_PROTOCOL_REF=eec79cdd4019dd42e1767909c5bd4e26d04c6f0f \
AOC_PROTOCOL_TARBALL_OUT=<out> \
  node scripts/protocol/build-protocol-tarball.mjs
```

The script re-verified the repository identity (`aoc-runtime` / `@aoc/protocol`) and that the
checkout HEAD equals the pinned ref, then ran `npm ci`, `npm run build --workspace @aoc/protocol`,
Protocol's own `protocol:consumer:check` (passed), and `npm pack`. Result:

```text
Built aoc-protocol-0.2.0-rc.1.tgz (280149 bytes)
SHA-256: b0d6ee6ff2010c4addab0bd683e2a89b9b2246f430c7e892fdc3d4123f3a3f60
```

— exactly the authoritative value. **Soberanía Protocol was not modified**: the clone is read-only
with respect to the upstream repository, and the canonical Protocol checkout on this machine was
neither written to nor checked out.

### Independent corroboration

Live Data Rail had already vendored rc.1 from the same authoritative source. Its copy was compared
**byte for byte** (`cmp`) against the artifact reproduced here: identical. Live Data Rail was not
modified; its tarball was read, never written, and it corroborates rather than supplies the bytes —
the authority for the Protocol artifact is Protocol's own pinned commit.

### Exports fingerprint

Recomputed from the **packed artifact's own** `package.json` (not the repository's), using the same
canonical-ordering method Protocol's `scripts/fingerprint-public-surface.mjs` and
`scripts/check-integration-contract.mjs` use:

```js
sha256(JSON.stringify(Object.keys(pkg.exports).sort().map((k) => [k, pkg.exports[k]])))
// => a67d65b17dcb34c7da84d9a07cb893e073e21e9edbbc621bcae649afa5cdeb45
```

This is **identical to rc.0's**: the Protocol public export map did not move across the repair. The
same 15 keys are declared, and the value also matches `protocol.exportMapDigest` inside the artifact's
own shipped `integration-contract.json`.

## Peer range: deliberately unchanged

The repin required **no change** to `peerDependencies["@aoc/protocol"]`, which stays
`>=0.1.0 || >=0.2.0-rc.0`. Re-verified mechanically with the same `semver` npm resolves with:

| Protocol version | Satisfied by `>=0.1.0 \|\| >=0.2.0-rc.0` |
| --- | --- |
| `0.1.0`, `0.1.5`, `0.2.0`, `0.3.0`, `1.0.0`, `2.0.0` | yes |
| `0.0.9` | no |
| `0.2.0-rc.0`, `0.2.0-rc.1`, `0.2.0-rc.2` | yes |
| `0.2.0-alpha.1`, `0.2.0-beta.9` | no |
| `0.1.0-rc.1`, `0.3.0-rc.0`, `1.0.0-rc.1` | no |

The range already admits exactly the `0.2.0` `rc` family and no other prerelease family. Restating it
to name `rc.1` would admit nothing new while discarding a validated expression, so it was left alone.

## Consumer regression: proving Frontera consumes the repaired candidate

`scripts/protocol/check-canonicalization-regression.mjs`
(`npm run check:protocol-canonicalization`, also run by `npm test` through
`tests/protocol-canonicalization-regression.test.mjs`) exercises the **installed**
`node_modules/@aoc/protocol` through its declared public `./canonical` export — not Protocol source,
not a copied function.

| Check | Result |
| --- | --- |
| installed `@aoc/protocol` version equals `protocol-consumer.lock.json` → `expectedVersion` | `0.2.0-rc.1` |
| installed artifact is **not** the burned `0.2.0-rc.0` | PASS |
| installed integration contract equals the version the lock records | `aoc.cross-repository-integration@1.0.1` |
| `canonicalizeJSON(7.9e-10)` | `"7.9e-10"` |
| `canonicalizeJSON(7.9e-100)` | `"7.9e-100"` |
| outputs distinct | `true` |
| digests distinct (`sha256` of each canonical form) | `true` |
| round trip (`JSON.parse(canonical) === value`, both values) | PASS |
| round trip across `1e-5`, `1e-10`, `1e-100`, `1e5`, `1e21`, `1.5e-300`, `9.87654321e-99` | PASS |

**The gate is load-bearing, not vacuous.** It was run against an `0.2.0-rc.0` install: 8 of its
checks fail there, including the explicit never-rc.0 identity guard, which is written as an
inequality against a literal burned version and therefore cannot mutate into a passing assertion when
the pin moves. This does not duplicate Protocol's ownership of canonicalization — the algorithm, its
profile and its own test suite remain Protocol's. It proves *consumption*: that this repository
resolves the intended candidate.

### Why the probe lives in `scripts/protocol/`

`./canonical` is a declared public export of `@aoc/protocol`, but three independent Frontera boundary
gates — `scripts/check-protocol-consumption.mjs`, `scripts/check-node16-imports.mjs` and the
forbidden-import scan inside `scripts/protocol/validate-enterprise-against-protocol-tarball.mjs` —
reject **every** `@aoc/protocol/<subpath>` specifier under `src/`, `packages/`, `tests/` and
`types/`. All three already exempt `scripts/protocol/` as the protocol tooling that must name such
specifiers. Placing the probe there keeps those gates at full strength: `ALLOWED_PROTOCOL_SUBPATHS`
was **not** widened, `verifiedPublicExports` in `protocol-consumer.lock.json` still lists the six
subpaths Frontera source may import, and Frontera source still may not import any Protocol subpath.

## What was preserved

- `vendor/aoc-protocol-0.2.0-rc.0.tgz` — the burned artifact, still tracked, never overwritten.
- `docs/release/PROTOCOL_CONSUMPTION_EVIDENCE_0.2.0-rc.0.md`, `PROTOCOL_CONSUMPTION_EVIDENCE.md` —
  byte-identical.
- `release/frontera-candidate-manifest-1.0.0.json`, `-1.1.0.json`, `-1.2.0.json` and
  `release/frontera-candidate-1.0.0.sbom.spdx.json` — byte-identical; they correctly continue to name
  `0.2.0-rc.0`, because that is the input those candidates really were validated against.
- `CHANGELOG.md`'s `1.1.0` and `1.2.0` entries — unchanged, including their statements that Protocol
  stayed pinned at rc.0 at the time.
- `protocol-consumer.lock.json` → `supersedes` records rc.0 by name, commit, SHA-256, SHA-512 and
  burn reason, with the earlier `0.1.0` record nested beneath it, so the full chain
  `0.1.0 → 0.2.0-rc.0 (BURNED) → 0.2.0-rc.1` stays readable in one place.
