import type {
  AocEnterpriseRuntimeHostPorts,
  DelegatedCapability,
  ExecutionGrant,
  LifecycleAuditEvent,
} from '@aoc-enterprise/runtime';

const signer = {
  async sign(payload: Record<string, unknown>): Promise<string> {
    return `mock-signature:${JSON.stringify(payload)}`;
  },
  async verify(payload: Record<string, unknown>, signature: string): Promise<boolean> {
    return signature === `mock-signature:${JSON.stringify(payload)}`;
  },
};

/** DEMO ONLY — not production durable. Replace with an atomic durable store. */
function createDemoExecutionGrantStore() {
  const grants = new Map<string, ExecutionGrant>();
  const consumed = new Set<string>();
  const revoked = new Set<string>();
  return {
    async persistGrant(grant: ExecutionGrant) {
      grants.set(grant.payload.grantId, grant);
    },
    async getGrant(grantId: string) {
      return grants.get(grantId);
    },
    async markGrantConsumed(grantId: string) {
      if (consumed.has(grantId)) return { consumed: false, reasonCodes: ['grant_replayed'] };
      consumed.add(grantId);
      return { consumed: true, reasonCodes: [] };
    },
    async isGrantConsumed(grantId: string) {
      return consumed.has(grantId);
    },
    async revokeGrant(grantId: string) {
      revoked.add(grantId);
    },
    async isGrantRevoked(grantId: string) {
      return revoked.has(grantId);
    },
  };
}

/** DEMO ONLY — not production durable. Replace with a durable delegation store. */
function createDemoDelegationStore() {
  const delegations = new Map<string, DelegatedCapability>();
  const revoked = new Set<string>();
  return {
    async persistDelegation(delegation: DelegatedCapability) {
      delegations.set(delegation.payload.delegationId, delegation);
    },
    async getDelegation(delegationId: string) {
      return delegations.get(delegationId);
    },
    async validateDelegation() {
      return { valid: true, reasonCodes: [] };
    },
    async revokeDelegation(delegationId: string) {
      revoked.add(delegationId);
    },
    async isDelegationRevoked(delegationId: string) {
      return revoked.has(delegationId);
    },
  };
}

/** DEMO ONLY — not production durable. Replace with a TTL-backed nonce/jti store. */
function createDemoReplayProtection() {
  const nonces = new Set<string>();
  return {
    async recordNonce(nonce: string, scope: string) {
      const key = `${scope}:${nonce}`;
      if (nonces.has(key)) return { recorded: false };
      nonces.add(key);
      return { recorded: true };
    },
    async hasSeenNonce(nonce: string, scope: string) {
      return nonces.has(`${scope}:${nonce}`);
    },
    async consumeNonce(nonce: string, scope: string) {
      const key = `${scope}:${nonce}`;
      if (!nonces.has(key)) return { consumed: false };
      nonces.delete(key);
      return { consumed: true };
    },
  };
}

export function createMockRuntimePorts(): AocEnterpriseRuntimeHostPorts {
  const lifecycleEvents: LifecycleAuditEvent[] = [];
  return {
    metadata: {
      runtimeId: 'external-host-runtime',
      trustDomain: 'example-trust-domain',
      environment: 'local-example',
      version: '0.1.0',
      host: 'enterprise-runtime-host-example',
    },
    signer,
    identity: {
      async resolveIdentity(actorId: string) {
        return { sub: actorId, tenant: 'tenant-example' };
      },
    },
    capabilityRegistry: {
      async hasCapability() {
        return true;
      },
    },
    delegationStore: {
      async validateDelegation() {
        return true;
      },
    },
    lifecycleDelegationStore: createDemoDelegationStore(),
    executionGrantStore: createDemoExecutionGrantStore(),
    replayProtection: createDemoReplayProtection(),
    policyDecision: {
      async evaluatePolicy() {
        return { allowed: true, reasonCodes: [] };
      },
    },
    agentAccess: {
      async evaluateAgentAccess() {
        return true;
      },
    },
    auditSink: {
      async emitAuthorizationAudit(input: Record<string, unknown>) {
        return {
          event_id: String(input.requestId ?? 'example-audit-event'),
          event_type: 'AUTHORIZATION_EVALUATED',
          occurred_at: new Date().toISOString(),
          request_id: String(input.requestId ?? 'example-request'),
          subject_id: String(input.actor ?? 'example-actor'),
        };
      },
    },
    lifecycleAuditSink: {
      async emitLifecycleAudit(event: LifecycleAuditEvent) {
        lifecycleEvents.push(event);
      },
    },
  };
}
