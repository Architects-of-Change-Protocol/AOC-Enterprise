export type AgentVisaStatus = 'active' | 'expired' | 'revoked' | 'suspended';

export interface AgentVisa {
  readonly id: string;

  readonly handshakeRequestId: string;
  readonly handshakeDecisionId: string;

  readonly localTrustDomainId: string;

  readonly externalAgentId: string;
  readonly localActorId?: string;

  readonly externalIssuerId?: string;
  readonly externalTrustDomainId?: string;

  readonly status: AgentVisaStatus;

  readonly allowedCapabilities: readonly string[];
  readonly allowedActions: readonly string[];
  readonly allowedResourceScopes: readonly string[];

  readonly dataDomains?: readonly string[];

  readonly issuedAt: string;
  readonly expiresAt?: string;

  readonly revokedAt?: string;
  readonly revokedByActorId?: string;
  readonly revocationReason?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
