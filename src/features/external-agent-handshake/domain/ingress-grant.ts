export type IngressGrantStatus = 'active' | 'expired' | 'revoked' | 'suspended';

export interface IngressGrant {
  readonly id: string;

  readonly agentVisaId: string;
  readonly localTrustDomainId: string;
  readonly externalAgentId: string;

  readonly status: IngressGrantStatus;

  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly capabilities: readonly string[];

  readonly issuedAt: string;
  readonly expiresAt?: string;

  readonly revokedAt?: string;
  readonly revokedByActorId?: string;
  readonly revocationReason?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
