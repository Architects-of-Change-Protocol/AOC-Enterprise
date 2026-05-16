# Runtime SDK Consumption Guide

This guide defines the supported consumption model for `@aoc-enterprise/runtime`.

## Allowed import entrypoints

Use only these entrypoints:

- `@aoc-enterprise/runtime`
- `@aoc-enterprise/runtime/authorization`
- `@aoc-enterprise/runtime/audit`
- `@aoc-enterprise/runtime/crypto`
- `@aoc-enterprise/runtime/adapters`

Do not import from deep internal paths.

## Authorization example

```ts
import {
  evaluateEnforcementPipeline,
  enforceEnforcementPipeline,
  type EnforcementEvaluationInput,
} from '@aoc-enterprise/runtime';

const input: EnforcementEvaluationInput = {
  requestId: 'req-1',
  tenantId: 'tenant-a',
  orgId: 'org-a',
  actorId: 'actor-123',
  capability: capabilityToken,
  access: scopedAccessRequest,
  consentGrants: []
};

const decision = await evaluateEnforcementPipeline(input, deps);
const enforced = await enforceEnforcementPipeline(input, deps);
```

## Audit example

```ts
import { emitRuntimeAuditEvent, type RuntimeAuditEmitter } from '@aoc-enterprise/runtime/audit';

const emitter: RuntimeAuditEmitter = {
  async emit(event) {
    await sink.write(event);
  },
};

await emitRuntimeAuditEvent(emitter, auditEventEnvelope);
```

## Crypto verification example

```ts
import { verifyCapabilityToken, verifyDelegatedCapability } from '@aoc-enterprise/runtime/crypto';

const tokenResult = verifyCapabilityToken(capabilityToken, {
  trustDomain: 'trust.aoc.local',
  revokedJti: revoked,
  nowIso: new Date().toISOString(),
});

const delegationResult = verifyDelegatedCapability(capabilityToken, actorClaims, store);
```

## Adapter implementation example

```ts
import type {
  IdentityResolverAdapter,
  PolicyDecisionAdapter,
  AuditSinkAdapter,
  CapabilityRegistryAdapter,
  AgentAccessEvaluatorAdapter,
} from '@aoc-enterprise/runtime/adapters';

export const identityResolver: IdentityResolverAdapter = {
  resolveIdentity: async (actorId, tenantId) => identityClient.resolve(actorId, tenantId),
};

export const policyDecision: PolicyDecisionAdapter = {
  evaluatePolicy: async (input) => policyEngine.evaluate(input),
};

export const auditSink: AuditSinkAdapter = {
  emitAuthorizationAudit: async (input) => auditClient.emitAuthorizationAudit(input),
};

export const capabilityRegistry: CapabilityRegistryAdapter = {
  hasCapability: async (actor, capability, orgId) => registry.hasCapability(actor, capability, orgId),
};

export const agentAccess: AgentAccessEvaluatorAdapter = {
  evaluateAgentAccess: async (actor, access, orgId) => accessControl.evaluate(actor, access, orgId),
};
```

## Vertical app integration (PMFreak style)

A vertical app should own adapter wiring and call runtime APIs only through stable entrypoints.
PMFreak compatibility should target `evaluateEnforcementPipeline` and `enforceEnforcementPipeline` from `@aoc-enterprise/runtime`.

## External installation and supported imports

Install from npm:

```bash
npm install @aoc-enterprise/runtime
```

Use only documented public entrypoints:

- `@aoc-enterprise/runtime`
- `@aoc-enterprise/runtime/authorization`
- `@aoc-enterprise/runtime/audit`
- `@aoc-enterprise/runtime/crypto`
- `@aoc-enterprise/runtime/adapters`

Unsupported import patterns (must remain blocked):

- `@aoc-enterprise/runtime/src/*`
- `@aoc-enterprise/runtime/runtime/*`
- any undeclared deep runtime evaluator/orchestration path

Compatibility note for current PMFreak consumers:

- `evaluateEnforcementPipeline` and `enforceEnforcementPipeline` remain available from `@aoc-enterprise/runtime`.
- Authorization and adapter types remain available through documented runtime entrypoints.

## Canonical Protocol Consumption
- Enterprise consumes protocol semantics exclusively from `@aoc/protocol/contracts`.
- Do not define local protocol semantic contracts; use runtime composition wrappers for Enterprise metadata.
- Local dev: prefer `@aoc/protocol` via `file:../Architects_of_Change_Protocol/packages/protocol` or protocol tarball install.
- Runtime TypeScript keeps `./types` in `typeRoots` only for non-protocol ambient bridges (`node-shims`, `@aoc-enterprise/policy-runtime`), never for protocol contract stubs.
- TypeScript resolution is modernized to `module`/`moduleResolution` = `Node16` to avoid deprecated `node`/`node10` behavior while preserving CommonJS runtime semantics.
- Registry target: publish `@aoc/protocol` and consume via semver from GitHub Packages or npm private registry.
