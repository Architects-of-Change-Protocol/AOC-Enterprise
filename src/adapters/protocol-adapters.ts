import type {
  AuditEventEnvelope,
  CapabilityToken,
  ConsentGrant,
  ScopedAccessRequest,
} from '@aoc/protocol';
import type { VerifiedActorClaims } from '@aoc-enterprise/identity';

export interface PolicyDecisionAdapter {
  evaluatePolicy(input: {
    requestId: string;
    tenantId: string;
    orgId: string;
    actor: VerifiedActorClaims;
    capability: CapabilityToken;
    consentGrants: ConsentGrant[];
    access: ScopedAccessRequest;
  }): Promise<{ allowed: boolean; reasonCodes: string[] }>;
}

export interface DelegationStoreAdapter {
  validateDelegation(actor: VerifiedActorClaims, capability: CapabilityToken, orgId: string): Promise<boolean>;
}

export interface AuditSinkAdapter {
  emitAuthorizationAudit(input: Record<string, unknown>): Promise<AuditEventEnvelope>;
}

export interface IdentityResolverAdapter {
  resolveIdentity(actorId: string, tenantId: string): Promise<VerifiedActorClaims>;
}

export interface CapabilityRegistryAdapter {
  hasCapability(actor: VerifiedActorClaims, capability: CapabilityToken, orgId: string): Promise<boolean>;
}

export interface AgentAccessEvaluatorAdapter {
  evaluateAgentAccess(actor: VerifiedActorClaims, access: ScopedAccessRequest, orgId: string): Promise<boolean>;
}
