import type { ActorType } from '../domain/actor.js';
import type { TrustDomain, TrustDomainStatus } from '../domain/trust-domain.js';
import type { RuntimeContext } from '../runtime/runtime-context.js';
import { TrustDomainNotFoundError } from '../runtime/runtime-errors.js';

export interface CreateTrustDomainInput {
  readonly id?: string;
  readonly name: string;
  readonly issuerActorId: string;
  readonly jurisdiction?: string;
  readonly acceptedIssuerIds: readonly string[];
  readonly acceptedActorTypes: readonly ActorType[];
  readonly policyPackIds?: readonly string[];
}

export class TrustDomainService {
  private readonly trustDomains = new Map<string, TrustDomain>();

  constructor(private readonly ctx: RuntimeContext) {}

  createTrustDomain(input: CreateTrustDomainInput): TrustDomain {
    const id = input.id ?? this.ctx.idGenerator.next('trust-domain');
    const timestamp = this.ctx.clock.now();
    const status: TrustDomainStatus = 'active';
    const trustDomain: TrustDomain = {
      id,
      name: input.name,
      issuerActorId: input.issuerActorId,
      acceptedIssuerIds: input.acceptedIssuerIds,
      acceptedActorTypes: input.acceptedActorTypes,
      policyPackIds: input.policyPackIds ?? [],
      status,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
    };
    this.trustDomains.set(trustDomain.id, trustDomain);
    return trustDomain;
  }

  getTrustDomain(trustDomainId: string): TrustDomain | undefined {
    return this.trustDomains.get(trustDomainId);
  }

  isIssuerAccepted(trustDomainId: string, issuerId: string | undefined): boolean {
    const trustDomain = this.trustDomains.get(trustDomainId);
    if (!trustDomain) {
      return false;
    }
    if (issuerId === undefined) {
      return false;
    }
    return trustDomain.acceptedIssuerIds.includes(issuerId);
  }

  getDomainPolicies(trustDomainId: string): readonly string[] {
    const trustDomain = this.trustDomains.get(trustDomainId);
    if (!trustDomain) {
      throw new TrustDomainNotFoundError(trustDomainId);
    }
    return trustDomain.policyPackIds;
  }
}
