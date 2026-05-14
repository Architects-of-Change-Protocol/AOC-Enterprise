# AOC Enterprise + AOC Protocol Integration

## Purpose

This document defines how AOC Enterprise consumes AOC Protocol primitives without redefining protocol semantics.

## Canonical ownership

AOC-Protocol is the **single source of truth** for:
- identity contracts
- capability token contracts
- consent grant contracts
- audit event envelope contracts
- scoped access grammar

AOC-Enterprise must import and orchestrate those primitives, not copy them.

## Enterprise orchestration ownership

AOC-Enterprise owns orchestration contracts for:
- policy-runtime
- tenant-governance
- org-boundary
- integration-runtime
- control-plane-sdk
- enterprise-audit
- agent-governance

These contracts are intentionally interface-first and implementation-neutral.

## Import strategy (current)

- Use placeholder protocol import path: `@aoc/protocol/contracts`
- Use TypeScript `import type` for protocol types.
- Do not add runtime dependencies in this phase.

## Contract boundaries

1. Protocol primitives remain canonical and product-neutral.
2. Enterprise contracts compose primitives with tenant/org/runtime context.
3. Applications should depend on enterprise facades instead of protocol internals when orchestration is required.

## Guardrails

- No protocol primitive redefinition in enterprise packages.
- No runtime implementations in these contract files.
- Keep schemas additive and minimally sufficient for orchestration.
- Avoid package-dependency wiring until integration phase.
