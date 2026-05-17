import type {
  AocIdentityClaims,
  AuditEventEnvelope,
  CapabilityToken,
  ConsentGrant,
  ScopedAccessRequest,
} from '@aoc/protocol';

export interface PolicyDecisionAdapter {
  evaluatePolicy(input: {
    requestId: string;
    tenantId: string;
    orgId: string;
    actor: AocIdentityClaims;
    capability: CapabilityToken;
    consentGrants: ConsentGrant[];
    access: ScopedAccessRequest;
  }): Promise<{ allowed: boolean; reasonCodes: string[] }>;
}

export interface DelegationStoreAdapter {
  validateDelegation(actor: AocIdentityClaims, capability: CapabilityToken, orgId: string): Promise<boolean>;
}

export interface AuditSinkAdapter {
  emitAuthorizationAudit(input: Record<string, unknown>): Promise<AuditEventEnvelope>;
}

export interface IdentityResolverAdapter {
  resolveIdentity(actorId: string, tenantId: string): Promise<AocIdentityClaims>;
}

export interface CapabilityRegistryAdapter {
  hasCapability(actor: AocIdentityClaims, capability: CapabilityToken, orgId: string): Promise<boolean>;
}

export interface AgentAccessEvaluatorAdapter {
  evaluateAgentAccess(actor: AocIdentityClaims, access: ScopedAccessRequest, orgId: string): Promise<boolean>;
}
