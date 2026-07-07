export type ExternalAgentType = 'agent' | 'agent_cluster' | 'system' | 'workflow' | 'service_account';

export type ExternalAgentStatus = 'unknown' | 'known' | 'trusted' | 'suspended' | 'revoked' | 'quarantined';

export interface ExternalAgentDescriptor {
  readonly id: string;

  readonly type: ExternalAgentType;
  readonly status: ExternalAgentStatus;

  readonly displayName: string;

  readonly externalIssuerId?: string;
  readonly externalTrustDomainId?: string;

  readonly claimedActorId?: string;
  readonly claimedPassportId?: string;

  readonly ownerOrganizationId?: string;
  readonly responsibleHumanActorId?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;

  readonly firstSeenAt: string;
  readonly lastSeenAt?: string;
}
