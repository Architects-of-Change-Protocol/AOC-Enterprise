import type {
  AocEnterpriseRuntimeHostPorts,
  DelegatedCapability,
  ExecutionGrant,
  LifecycleAuditEvent,
} from '@aoc-enterprise/runtime';

const signer = {
  currentKeyId: 'key-2026',
  trustedKeys: new Map([['key-2026', { revoked: false }], ['key-2025', { revoked: false }], ['key-old-revoked', { revoked: true }]]),
  async sign(payload: Record<string, unknown>) {
    return {
      signature: `mock-signature:${this.currentKeyId}:${JSON.stringify(payload)}`,
      signer: { signerId: 'demo-signer', keyId: this.currentKeyId, algorithm: 'mock-ed25519', issuedBy: 'demo-host', trustAnchorVersion: 'v2' },
    };
  },
  async verify(payload: Record<string, unknown>, signature: string): Promise<boolean> {
    return signature.startsWith('mock-signature:') && signature.endsWith(JSON.stringify(payload));
  },
  async getCurrentKeyId() { return this.currentKeyId; },
  async getTrustedVerificationKeys() {
    return [...this.trustedKeys.entries()].map(([keyId, state]) => ({ keyId, revoked: state.revoked }));
  },
  async verifyWithKeyId(payload: Record<string, unknown>, signature: string, keyId: string): Promise<boolean> {
    const state = this.trustedKeys.get(keyId);
    if (!state || state.revoked) return false;
    return signature === `mock-signature:${keyId}:${JSON.stringify(payload)}`;
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



/** DEMO ONLY — not production durable. Replace with durable claim lifecycle storage. */
function createDemoClaimStore() {
  const claims = new Map<string, any>();
  const revoked = new Set<string>();
  return {
    async persistClaim(claim: any) { claims.set(claim.payload.claimId, claim); },
    async getClaim(claimId: string) { return claims.get(claimId); },
    async revokeClaim(claimId: string) { revoked.add(claimId); },
    async isClaimRevoked(claimId: string) { return revoked.has(claimId); },
    async validateClaim() { return { valid: true, reasonCodes: [] }; },
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
        return { sub: actorId };
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
    capabilityClaimStore: createDemoClaimStore(),
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
