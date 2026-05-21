# Runtime SDK Versioning and Stability

## Stability categories

- **Stable**: exported from documented runtime entrypoints and covered by compatibility expectations.
- **Compatibility**: transitional APIs kept for migration support; may be removed in the next major release.
- **Internal**: implementation modules and deep paths; not covered by compatibility guarantees.
- **Experimental**: explicitly marked and excluded from long-term compatibility guarantees.

## Stable runtime surface

Stable entrypoints are:

- `@aoc-enterprise/runtime`
- `@aoc-enterprise/runtime/authorization`
- `@aoc-enterprise/runtime/audit`
- `@aoc-enterprise/runtime/crypto`
- `@aoc-enterprise/runtime/adapters`

Only exports available from these entrypoints are part of the SDK-safe contract.

## Semantic versioning intent

- Patch: bug fixes and non-breaking internal changes.
- Minor: additive stable exports and optional behavior.
- Major: breaking changes to stable runtime APIs.

## Breaking change policy

Breaking changes to stable APIs require:

1. explicit release note callouts,
2. migration guidance,
3. major version increment.

## Deprecation policy

Compatibility exports are marked in docs first, then deprecated for at least one minor release before removal in a major release.

## PMFreak and future consumer expectations

PMFreak and other consumers should import only from stable entrypoints. Deep internal module imports are unsupported and can change without notice.

## Runtime package surface discipline

`@aoc-enterprise/runtime` follows explicit export-map contracts. Only declared root and subpath exports are considered stable, versioned API surface.

Consumer rules:

1. Import only from declared export-map paths.
2. Never import from `src/` or undeclared deep runtime paths.
3. Treat compatibility aliases as transitional and monitor release notes for migration windows.

The repository validates these guarantees with publishability checks that run `npm pack`, install the tarball in an isolated fixture, and verify both positive and negative import resolution.

## Stability Contract
- Protocol contract authority lives in `@aoc/protocol/contracts`.
- Enterprise runtime SDK exposes stable entrypoints only: `@aoc-enterprise/runtime`, `/authorization`, `/audit`, `/crypto`, `/adapters`.
- PMFreak compatibility exports are preserved while runtime internals remain non-public.
