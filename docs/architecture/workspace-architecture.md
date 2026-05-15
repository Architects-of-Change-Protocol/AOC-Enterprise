# AOC-Enterprise Workspace Architecture

## Topology
- `src/`: enterprise runtime layer entrypoint and internal runtime modules (enforcement, audit, crypto, adapters).
- `packages/`: package-scoped orchestration domains and contracts.
- `types/`: local ambient protocol-contract typing bridge for compilation until protocol package wiring is finalized.
- `docs/architecture/`: canonical architecture and boundary guidance.
- `.github/workflows/`: CI validation workflows.

## Boundary Rules
1. Protocol semantics are imported from `@aoc/protocol/contracts` only.
2. Runtime orchestration stays in enterprise packages/runtime modules.
3. Persistence/runtime projections may extend protocol primitives but must not redefine protocol semantics.
4. New exports must be intentionally added; avoid wildcard exports.

## Contribution Guidance
- Run `npm run typecheck && npm run build && npm run lint && npm test` before opening PRs.
- Keep cross-package imports through package entrypoints; avoid deep imports across package boundaries.
- Do not embed vertical-app (e.g. PMFreak) logic in this repository.
