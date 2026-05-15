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
