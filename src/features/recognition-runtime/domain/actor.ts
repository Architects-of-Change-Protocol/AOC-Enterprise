export type ActorType = 'human' | 'organization' | 'agent' | 'system' | 'external' | 'unknown';

export type ActorStatus = 'recognized' | 'unrecognized' | 'suspended' | 'revoked' | 'expired' | 'unknown';

export interface Actor {
  readonly id: string;
  readonly type: ActorType;
  readonly displayName: string;
  readonly status: ActorStatus;
  readonly issuerId?: string;
  readonly trustDomainId?: string;
  readonly jurisdiction?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
