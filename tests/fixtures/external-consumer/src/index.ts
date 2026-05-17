import {
  enforceEnforcementPipeline,
  evaluateEnforcementPipeline,
  type EnforcementEvaluationInput,
} from '@aoc-enterprise/runtime';
import { verifyCapabilityToken } from '@aoc-enterprise/runtime/crypto';
import type { PolicyDecisionAdapter } from '@aoc-enterprise/runtime/adapters';
import type { CapabilityToken, ConsentGrant, ScopedAccessRequest } from '@aoc/protocol';

const policyDecisionAdapter: PolicyDecisionAdapter = {
  evaluatePolicy: async () => ({
    allowed: true,
    reasonCodes: [],
  }),
};

const input: EnforcementEvaluationInput & {
  capability: CapabilityToken;
  consentGrants: ConsentGrant[];
  access: ScopedAccessRequest;
} = {
  requestId: 'req-1',
  actorId: 'user-1',
  capability: { jti: 'jti-1', trust_domain: 'enterprise', exp: 4102444800 },
  consentGrants: [],
  access: { action: 'read', resource: 'tenant:123' },
  tenantId: 'tenant-123',
  orgId: 'org-123',
};

const deps = {
  policyDecision: policyDecisionAdapter,
  delegationStore: { validateDelegation: async () => true },
  auditSink: { emitAuthorizationAudit: async () => ({}) },
  identity: { resolveIdentity: async () => ({ sub: 'user-1' }) },
  capabilityRegistry: { hasCapability: async () => true },
  agentAccess: { evaluateAgentAccess: async () => true },
};

const evaluation = await evaluateEnforcementPipeline(input, deps);
await enforceEnforcementPipeline(input, deps);

const capabilityVerification = verifyCapabilityToken(input.capability, {
  trustDomain: 'enterprise',
  revokedJti: new Set<string>(),
  nowIso: new Date().toISOString(),
});

if (!evaluation.allowed || !capabilityVerification.valid) {
  throw new Error('Unexpected fixture failure.');
}
