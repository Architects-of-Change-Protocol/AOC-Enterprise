import type { AocEnterpriseRuntimeHostPorts } from '@aoc-enterprise/runtime';

const signer = {
  async sign(payload: Record<string, unknown>): Promise<string> {
    return `mock-signature:${JSON.stringify(payload)}`;
  },
  async verify(payload: Record<string, unknown>, signature: string): Promise<boolean> {
    return signature === `mock-signature:${JSON.stringify(payload)}`;
  },
};

export function createMockRuntimePorts(): AocEnterpriseRuntimeHostPorts {
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
  };
}
