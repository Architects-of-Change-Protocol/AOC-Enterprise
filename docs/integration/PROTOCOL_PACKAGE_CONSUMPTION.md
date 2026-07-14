# AOC Enterprise ← AOC Protocol: Versioned Package Consumption

## Architecture

AOC Enterprise consumes AOC Protocol exclusively as a **published package boundary**, never as source:

```text
AOC Protocol (packages/protocol, @aoc/protocol)
    ↓ versioned public package (peerDependency ">=0.1.0")
AOC Enterprise (this repository)
    ↓ proprietary runtime and implementation
PMFreak
```

Enterprise imports only from the package specifier `@aoc/protocol` and its declared public
subpaths (`./contracts`, `./errors`, `./claims`, `./adapters`, `./runtime-registry`). It never
imports Protocol source files, `packages/protocol/src`, `dist` deep paths, or any relative path
into the `Architects_of_Change_Protocol` repository. `scripts/check-protocol-consumption.mjs`
enforces this on every CI run.

AOC Protocol is **not yet published to a registry**. Until it is, canonical compatibility between
the two repositories is proven with a **reproducible tarball built from a pinned Protocol commit**,
not by requiring both repositories to sit in sibling directories, and not by trusting a mutable
branch.

## Supported Protocol version

The commit and package version Enterprise is currently validated against are recorded in
[`protocol-consumer.lock.json`](../../protocol-consumer.lock.json) at the repository root. That
file — not this document — is the source of truth; re-read it before relying on the numbers below,
which are a point-in-time summary:

| Field | Value |
| --- | --- |
| Protocol repository | `Architects-of-Change-Protocol/Architects_of_Change_Protocol` |
| Protocol commit | see `protocol-consumer.lock.json` → `commit` |
| Protocol package | `@aoc/protocol` |
| Protocol package version | see `protocol-consumer.lock.json` → `expectedVersion` |
| Enterprise peer range | `package.json` → `peerDependencies["@aoc/protocol"]` (currently `>=0.1.0`) |

`protocol-consumer.lock.json` is **not an npm lockfile**. It is a small, auditable, hand-updated
record of which Protocol artifact this repository has actually been validated against — the
cross-repository analogue of a commit pin.

## Local validation

Two scripts under `scripts/protocol/` reproduce the full consumption story locally, without
requiring the two repositories to be sibling checkouts:

1. **Build a reproducible tarball from a pinned commit:**

   ```bash
   # Option A — you already have a local Protocol checkout at the exact commit:
   AOC_PROTOCOL_REPO=/path/to/Architects_of_Change_Protocol \
     node scripts/protocol/build-protocol-tarball.mjs

   # Option B — fetch the exact pinned commit into a throwaway temp checkout:
   AOC_PROTOCOL_REPO=https://github.com/Architects-of-Change-Protocol/Architects_of_Change_Protocol.git \
     AOC_PROTOCOL_REF=<full 40-character commit SHA> \
     node scripts/protocol/build-protocol-tarball.mjs
   ```

   This validates repository/commit identity, runs `npm ci` + Protocol's own build, optionally runs
   Protocol's own consumer/package validation (`npm run protocol:consumer:check`; opt out with
   `AOC_PROTOCOL_SKIP_CONSUMER_CHECK=true`), packs `packages/protocol` with `npm pack`, computes a
   SHA-256 of the tarball, and prints a JSON result (repository, commit, package, version, tarball
   path, checksum). It never publishes anything and cleans up any temporary checkout it created.

2. **Validate Enterprise against that tarball, in isolation:**

   ```bash
   node scripts/protocol/validate-enterprise-against-protocol-tarball.mjs <path-to-tarball>
   ```

   This copies the Enterprise repository into a throwaway temp directory (excluding `.git`,
   `node_modules`, `dist`, `coverage`, and other build artifacts), points its `@aoc/protocol`
   devDependency at the tarball via an absolute `file:` path, deletes the copy's lockfile so npm
   resolves fresh, narrows the local TypeScript ambient shim down to *only* the documented export
   gap (see "Known gaps" below — every other symbol resolves against the real installed tarball),
   runs `npm install`, and then runs the full validation battery (`typecheck`, `build`, `lint`,
   `test`, `check:protocol-consumption`, `check:aoc-boundaries`, `validate:publishability`,
   `check:release-integrity`) inside that isolated copy. It additionally scans for forbidden deep
   imports, sibling-path leakage in the resulting lockfile/`node_modules`, and declaration files
   that leak local filesystem paths. It never touches the real repository's `package.json` or
   `package-lock.json`, and it deletes the temp copy on exit (success or failure).

3. **Validate the compatibility lock itself:**

   ```bash
   node scripts/protocol/check-compatibility-lock.mjs
   ```

   Checks that `protocol-consumer.lock.json` is well-formed and internally consistent (full commit
   SHA, exact repository slug, exact package name, non-empty verified export list, a well-formed
   SHA-256 tarball checksum).

The root `package.json` exposes these as `npm run protocol:tarball:build` and
`npm run protocol:tarball:validate` (see that file for exact invocations).

## CI validation

`.github/workflows/publishability.yml` builds a pinned-commit tarball (reading the commit from
`protocol-consumer.lock.json`) inside the CI runner's own temp space, then runs
`scripts/protocol/validate-enterprise-against-protocol-tarball.mjs` against it — the same isolated,
tarball-backed validation described above, on every pull request and push to `main`/`master`. It
does **not** clone Protocol into a fixed sibling path, does **not** trust a mutable branch, does
**not** publish anything, does **not** use an npm publish token, and does **not** create a release
or tag. `.github/workflows/ci.yml` (typecheck/build/lint/test/legal) is unaffected — it has never
required the Protocol sibling checkout, because the local ambient shim (below) already lets it
build in isolation.

## Allowed imports

Enterprise source may import only:

- `@aoc/protocol`
- `@aoc/protocol/contracts`
- `@aoc/protocol/errors`
- `@aoc/protocol/claims`
- `@aoc/protocol/adapters`
- `@aoc/protocol/runtime-registry`

As of this sprint, Enterprise's own source only actually consumes the root specifier
(`@aoc/protocol`) — note that Protocol's `package.json` `"main"`/`"exports"["."]` and
`exports["./contracts"]` point at the identical build output, so this is not a behavioral gap, just
an unused-subpath fact worth knowing. Deep imports (`@aoc/protocol/src/*`, `@aoc/protocol/dist/*`,
`@aoc/protocol/internal/*`), relative imports into the Protocol repository, and any other
undeclared subpath are rejected by `scripts/check-protocol-consumption.mjs` and
`scripts/check-node16-imports.mjs`.

## Known gaps

Three confirmed, documented incompatibilities exist between Enterprise's runtime source and the
real, published `@aoc/protocol` package as of the pinned commit. **None of them are fixed by this
sprint** — this sprint's job was to build the tooling that could *discover and prove* them, not to
carry out application-level contract migrations. Each is a real, load-bearing finding (not a
packaging nit): the isolated tarball validator's `typecheck`, `build`, and `test` steps genuinely
fail because of gaps 2 and 3 below, and that failure is reported accurately rather than hidden.

| # | Finding | Used in | Real shape | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| 1 | `AocIdentityClaims` does not exist in the real package at all | `src/runtime/context.ts`, `src/adapters/protocol-adapters.ts`, `packages/agent-governance/src/contracts.ts`, `packages/tenant-governance/src/contracts.ts`, `packages/integration-runtime/src/contracts.ts`, `packages/control-plane-sdk/src/contracts.ts`, `packages/policy-runtime/src/contracts.ts` | Not exported by `contracts`, `errors`, `claims`, `adapters`, or `runtime-registry` | **Partial — blocked by missing Protocol export** | AOC Protocol should determine canonical ownership of an identity-claims contract and, if confirmed protocol-level, export it through an approved public subpath. Type-only (`import type`) usage, zero runtime impact. This repository does not modify AOC Protocol to close this gap. |
| 2 | `ScopedAccessRequest` shape mismatch: Enterprise reads `.scope`/`.action`; the real type has neither | `packages/control-plane/types.ts` (`ScopedAccessRequest['scope']` used 3×), `src/runtime/host.ts` (`.scope`/`.action` property access, 3 sites) | Real: `{ principalId, resource: ResourceRef, requestedScope: AgentScope, requestedAt }` (see `packages/protocol/src/contracts/index.ts`) | **Confirmed incompatibility — not fixed this sprint** | A follow-up should re-point the type extraction at `ScopedAccessRequest['requestedScope']` and update the two call sites in `host.ts` to the real field names. Assessed as a mechanical, type-only change (Enterprise's own persistence field names such as `requested_scope` are unaffected), but it was not applied in this sprint pending explicit sign-off, since it touches tracked application source. |
| 3 | `AuditEventEnvelope` field-naming divergence: Enterprise constructs `event_id`/`occurred_at`/`subject_id`/`requester_id`/`request_id`; the real type has none of these | `packages/control-plane/service.ts` (object-literal construction, 4 sites), `packages/control-plane/types.ts` (`ControlPlaneAuditEvent = AuditEventEnvelope & {...}`) | Real: `{ eventId, eventType, emittedAt, actorId?, payload }` (see `packages/protocol/src/contracts/index.ts`) | **Confirmed incompatibility — not fixed this sprint** | This is a real runtime-level migration (renaming constructed-object fields, not just types) with implications for anything reading `ControlPlaneAuditEvent` (tests, fixtures, potentially persisted/exported audit formats). Out of scope for a packaging/integration sprint; needs its own scoped migration sprint with full call-site mapping. |

Gaps 2 and 3 were discovered empirically by running `scripts/protocol/validate-enterprise-against-protocol-tarball.mjs`
against the real tarball — they were invisible before this sprint because
`types/aoc-protocol/index.d.ts` (the local ambient shim) independently invented loose,
incorrect shapes for both `ScopedAccessRequest` and `AuditEventEnvelope` that happened to satisfy
Enterprise's existing code. This is the clearest evidence in this audit for why the shim was never
a substitute for validating against the real package.

`scripts/check-protocol-consumption.mjs` allowlists exactly one file
(`types/aoc-protocol/index.d.ts`) as a documented, non-canonical local-dev convenience, with a
comment explaining why; any *new* local ambient declaration elsewhere in the tree fails the check.

## Local development convenience (non-canonical)

Two mechanisms exist purely to make local development and the always-green `ci.yml` job independent
of whether the Protocol repository happens to be checked out as a sibling directory:

- `package.json` → `devDependencies["@aoc/protocol"] = "file:../Architects_of_Change_Protocol/packages/protocol"`.
  This is **never required** — `npm ci`/`typecheck`/`build`/`lint`/`test` all pass without it (the
  sibling path does not exist in CI or in a fresh clone; npm silently leaves a dangling symlink,
  and TypeScript never needs to resolve it — see next point).
- `tsconfig.base.json` → `compilerOptions.paths["@aoc/protocol"]` maps the specifier to
  `types/aoc-protocol/index.d.ts`, a local ambient module declaration. This lets `tsc` typecheck
  without any real install of `@aoc/protocol` at all.

Neither mechanism is the canonical signal that Enterprise is compatible with real, published
Protocol contracts — a hand-maintained local shim can silently drift from the real package (this
audit found exactly that: the shim's `PolicyDecision` and `AgentScope` shapes already differ
structurally from the real package's, though neither is currently used by Enterprise code). The
canonical signal is the isolated tarball validation described above, run in CI on every change.

## Upgrade procedure

1. Build a new tarball from the target Protocol commit:
   `AOC_PROTOCOL_REPO=<url> AOC_PROTOCOL_REF=<new full commit SHA> node scripts/protocol/build-protocol-tarball.mjs`.
2. Run `node scripts/protocol/validate-enterprise-against-protocol-tarball.mjs <tarball path>` and
   confirm every step passes.
3. Review the diff in Protocol's public exports between the previously-pinned commit and the new
   one (in particular, check whether `AocIdentityClaims` — or an equivalent — has been added; if so,
   remove it from `KNOWN_EXPORT_GAPS` in `scripts/protocol/validate-enterprise-against-protocol-tarball.mjs`
   and from the "Known gaps" table above, and migrate Enterprise's imports to the real export in a
   follow-up change).
4. Run the full release gate locally (`npm run validate:release`, and `npm run validate:v1-release`
   when cutting a release).
5. Update `protocol-consumer.lock.json` with the new commit, tarball filename, and SHA-256, and run
   `node scripts/protocol/check-compatibility-lock.mjs` to confirm it is well-formed.
6. Open a PR. CI re-runs the same isolated tarball validation independently.
7. Merge only once CI is green. Do not publish `@aoc/protocol` or `@aoc-enterprise/runtime`, create a
   release, or create a tag as part of this procedure.

## Rollback

Revert `protocol-consumer.lock.json` to the previously-validated commit/tarball checksum (git
history is the audit trail — every change to this file should be its own commit), then re-run
`node scripts/protocol/validate-enterprise-against-protocol-tarball.mjs` against a freshly-built
tarball of that prior commit to confirm the rollback target still validates cleanly.

## Registry transition

AOC Protocol is **not currently published** to any npm registry, GitHub Packages, or equivalent.
This sprint's tarball-from-pinned-commit flow is an explicit interim measure. Once Protocol
publishes a prerelease, this repository's canonical validation should move to installing
`@aoc/protocol` from that registry at an exact version or governed semver range, and the tarball
flow becomes a fallback/offline-development path rather than the CI-canonical one. That migration
is out of scope for this sprint and does not happen automatically.
