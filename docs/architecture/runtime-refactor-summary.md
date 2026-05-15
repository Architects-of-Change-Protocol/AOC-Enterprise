# Enterprise Runtime Refactor Summary

## What changed

- AOC-Enterprise now provides runtime adapter interfaces and concrete orchestration boundaries under `src/runtime` and `src/adapters`.
- Control-plane local protocol-like contract duplication was reduced by replacing local consent/scope/audit primitives with imports from `@aoc/protocol/contracts`.
- Enforcement flow is centralized in `evaluateEnforcementPipeline`, which coordinates identity resolution, capability checks, delegation validation, policy decisioning, and audit emission.
- Crypto verification is centralized in `src/runtime/crypto/verification` for delegated capability integrity checks.

## Remaining runtime-only extensions

- `AccessRequestRecord`, `ConsentDecisionRecord`, and `GrantedAccessRecord` remain as persistence projections for the control-plane runtime state.
- Runtime negotiation and governance treaty packages remain enterprise runtime models (not protocol primitives), and should be mapped to protocol contracts incrementally.

## Temporary compatibility

- `ControlPlaneAuditEvent` currently extends protocol `AuditEventEnvelope` while preserving existing event tags for backward compatibility.
