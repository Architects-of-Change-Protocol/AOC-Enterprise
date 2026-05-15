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
