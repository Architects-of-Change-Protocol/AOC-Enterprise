import {
  enforceEnforcementPipeline,
  evaluateEnforcementPipeline,
  type EnforcementEvaluationInput,
} from '@aoc-enterprise/runtime';
import { verifyCapabilityToken } from '@aoc-enterprise/runtime/crypto';
import type { PolicyDecisionAdapter } from '@aoc-enterprise/runtime/adapters';

const policyDecisionAdapter: PolicyDecisionAdapter = {
  evaluatePolicy: async () => ({
    allowed: true,
    reasonCodes: [],
  }),
};

const input: EnforcementEvaluationInput = {
  requestId: 'req-1',
  actorId: 'user-1',
  capability: {
    schemaVersion: '1.0.0',
    tokenId: 'token-1',
    issuer: 'issuer-1',
    subject: 'user-1',
    resource: { kind: 'tenant', id: '123' },
    scope: ['read'],
    expiresAt: '2100-01-01T00:00:00.000Z',
    // proofRef is required here (R004.A): verifyCapabilityToken now treats a
    // non-'custom' proof with no proofRef as unverifiable and fails closed,
    // so a fixture token asserting a successful verification must carry one.
    proof: { proofType: 'jwt', proofRef: 'sig-ref-fixture-1', issuedAt: new Date().toISOString() },
  },
  consentGrants: [],
  access: {
    principalId: 'user-1',
    resource: { kind: 'tenant', id: '123' },
    requestedScope: ['read'],
    requestedAt: new Date().toISOString(),
    action: 'read',
  },
  tenantId: 'tenant-123',
  orgId: 'org-123',
};

const deps = {
  policyDecision: policyDecisionAdapter,
  delegationStore: { validateDelegation: async () => true },
  auditSink: {
    emitAuthorizationAudit: async () => ({
      eventId: 'evt-1',
      eventType: 'AUTHORIZATION_EVALUATED',
      emittedAt: new Date().toISOString(),
      payload: {},
    }),
  },
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
