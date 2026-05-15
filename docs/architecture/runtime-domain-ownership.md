# Runtime Domain Ownership

## Canonical runtime domains

The runtime is organized under `src/runtime` with explicit ownership boundaries:

- `authorization/`: authorization decisions, evaluators, grants, and guardrail-ready interfaces.
- `capabilities/`: capability registry-domain runtime ownership (reserved for provider-specific registry execution).
- `delegation/`: delegation validation and lifecycle ownership.
- `consent/`: consent validation ownership.
- `audit/`: protocol-aligned audit emitters and audit pipelines.
- `agents/`: machine identity/scope/delegation runtime ownership.
- `identity/`: actor identity resolution runtime ownership.
- `governance/`: treaties/authority/boundary runtime ownership.
- `enforcement/`: compatibility-facing enforcement façade APIs.
- `execution/`: direct runtime execution concerns.
- `crypto/`: signing, verification, trust, revocation, claims, proofs.
- `observability/`: telemetry, metrics, tracing, health.
- `integrations/`: external identity/storage/enterprise/messaging/agent bridges.
- `orchestration/`: cross-domain sequencing and workflow coordination.

## Orchestration vs execution

- Orchestration is centralized in `runtime/orchestration/pipelines/authorization-orchestrator.ts`.
- Authorization execution/evaluation is isolated in `runtime/authorization/evaluators/authorization-evaluator.ts`.
- Backward-compatible enforcement surface remains at `runtime/enforcement/authorization-pipeline.ts`, but delegates orchestration instead of acting as a god service.

## Layering contract

1. Protocol adapters define externalized semantics contracts.
2. Orchestrators coordinate domain evaluators and runtime emitters.
3. Execution/evaluator modules perform specialized checks only.
4. Audit emission occurs as a dedicated runtime concern after decision composition.

This keeps runtime semantics in protocol contracts while preserving enterprise ownership of orchestration and enforcement behavior.
