import type { ActorType } from './actor.js';

export type TrustDomainStatus = 'active' | 'suspended' | 'retired';

export interface TrustDomain {
  readonly id: string;
  readonly name: string;
  readonly issuerActorId: string;
  readonly jurisdiction?: string;
  readonly acceptedIssuerIds: readonly string[];
  readonly acceptedActorTypes: readonly ActorType[];
  readonly policyPackIds: readonly string[];
  readonly status: TrustDomainStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}
