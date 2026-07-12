# AOC Enterprise — Dependency Audit (v1.0.0)

Audit date: 2026-07-12 · npm 10.x · lockfile `package-lock.json` (v3, pinned).

## Runtime dependency surface (the release deliverable)

The Enterprise runtime (`@aoc-enterprise/runtime`) has exactly **one** production dependency:

| dependency | version (lock) | purpose | notes |
|---|---|---|---|
| `better-sqlite3` | ^12.11.1 (12.11.1) | The three SQLite stores | Loaded lazily (`await import`) only when the `sqlite` provider is selected; the `memory` provider runs dependency-free. Native module with prebuilt binaries; its transitive tree (`bindings`, `prebuild-install`, `node-gyp` toolchain helpers) is build/install-time only. `prebuild-install` is flagged deprecated upstream — install-time only, no runtime exposure; tracked for replacement when `better-sqlite3` migrates. |

Peer dependencies: `@aoc/protocol` (>=0.1.0, supplied by the consuming environment as a sibling checkout; type-shimmed for isolated builds via `types/aoc-protocol/`), `react`/`react-dom` (optional, only for UI-consuming hosts).

Dev dependencies: TypeScript type packages (`@types/better-sqlite3`, `@types/react*`), `react`/`react-dom` (test/dev), workspace self-references. No test framework, no linter framework, no build tool beyond `tsc` — lint checks are plain-Node scripts in `scripts/`.

**Assessment: minimal surface, nothing unused, nothing to remove.** The new `@aoc-enterprise/enterprise-host-sdk` workspace adds **zero** dependencies.

## npm audit

`npm audit` reports **2 advisories (1 high, 1 moderate)**, both confined to the private demo app `apps/agent-passport-web` (not part of the Enterprise runtime deliverable, `private: true`, never published):

| package | advisory class | where | disposition |
|---|---|---|---|
| `next` 14.2.35 | multiple (DoS, cache poisoning, SSRF in app-router features) | `apps/agent-passport-web` only | Accepted for v1.0.0. The fix npm proposes is `next@16` (breaking). The app is an internal demo/SaaS prototype, not shipped with the runtime; upgrade tracked as post-v1 work. None of the runtime's code paths load `next`. |
| `postcss` (via `next`) | XSS in stringify output | same | Same disposition (transitive of `next`). |

`npm audit --omit=dev` against the runtime dependency set alone (excluding the app workspace) reports **no advisories for `better-sqlite3` or its tree**.

## License compatibility

| package | license |
|---|---|
| `better-sqlite3` | MIT |
| `bindings`, `prebuild-install` and transitive tree | MIT / Apache-2.0 / ISC / BSD-2-Clause |
| `next`, `react`, `react-dom`, `stripe`, `typescript`, `@types/*` (dev/app only) | MIT / Apache-2.0 |

No copyleft (GPL/AGPL/LGPL) licenses anywhere in the tree. No license conflicts.

## Version pinning & reproducibility

- `package-lock.json` (lockfileVersion 3) pins every transitive version + integrity hash; CI and deployments must use `npm ci`.
- Semver ranges in manifests are caret-bounded; the lockfile is the source of truth for the release build.
- The release manifest (`release/RELEASE_MANIFEST.json`) records SHA-256 checksums of the built public artifacts for independent re-verification.

## Workspace hygiene findings

- `packages/governance-treaties` and `packages/runtime-negotiation` are stub workspaces (`{"type":"module"}` manifests, no name/version/build). Not consumed by the runtime; their parked tests are documented in `TEST_STRATEGY_V1.md`. Post-v1: promote or remove.
- `packages/control-plane-sdk` declares `"test": "node --import tsx --test"` referencing `tsx`, which is not a dependency; the script currently matches zero test files so it exits clean. Post-v1: align it with the standard `tsconfig.test.json` convention.
- `apps/` contains four empty placeholder dirs (`agent-gateway`, `audit-console`, `dashboard`, `policy-engine`) with `.gitkeep` only — no dependency impact.

## Conclusion

The shipped runtime's dependency surface is already minimal (one production dependency, lazily loaded). Known advisories are isolated to a private demo app and accepted with a documented post-v1 upgrade path. No unused production dependencies exist to remove; no license issues; the build is fully pinned and reproducible.
