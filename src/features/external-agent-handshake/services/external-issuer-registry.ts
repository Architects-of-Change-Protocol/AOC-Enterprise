import type { ExternalAgentType } from '../domain/external-agent-descriptor.js';
import type { ExternalTrustIssuer, ExternalTrustIssuerStatus } from '../domain/external-trust-issuer.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { ExternalIssuerNotFoundError } from '../runtime/handshake-runtime-errors.js';
import type { HandshakeStore } from './handshake-store.js';

export type RegisterExternalIssuerInput = Omit<ExternalTrustIssuer, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
  readonly id?: string;
  readonly status?: ExternalTrustIssuerStatus;
};

/**
 * Registers and administers ExternalTrustIssuer records: which foreign
 * issuers this trust domain will even consider, what agent types/capabilities/
 * scopes they may present, and their current trust status. Deterministic --
 * no verification of real-world issuer identity happens here.
 */
export class ExternalIssuerRegistry {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
  ) {}

  registerExternalIssuer(input: RegisterExternalIssuerInput): ExternalTrustIssuer {
    const now = this.ctx.clock.now();
    const issuer: ExternalTrustIssuer = {
      ...input,
      id: input.id ?? this.ctx.ids.nextId('external-issuer'),
      status: input.status ?? 'unknown',
      createdAt: now,
      updatedAt: now,
    };
    return this.store.putExternalIssuer(issuer);
  }

  getExternalIssuer(externalIssuerId: string): ExternalTrustIssuer | undefined {
    return this.store.getExternalIssuer(externalIssuerId);
  }

  trustExternalIssuer(externalIssuerId: string): ExternalTrustIssuer {
    return this.setStatus(externalIssuerId, 'trusted');
  }

  limitExternalIssuer(externalIssuerId: string): ExternalTrustIssuer {
    return this.setStatus(externalIssuerId, 'limited');
  }

  suspendExternalIssuer(externalIssuerId: string): ExternalTrustIssuer {
    return this.setStatus(externalIssuerId, 'suspended');
  }

  revokeExternalIssuer(externalIssuerId: string): ExternalTrustIssuer {
    return this.setStatus(externalIssuerId, 'revoked');
  }

  private setStatus(externalIssuerId: string, status: ExternalTrustIssuerStatus): ExternalTrustIssuer {
    const existing = this.store.getExternalIssuer(externalIssuerId);
    if (!existing) {
      throw new ExternalIssuerNotFoundError(externalIssuerId);
    }
    const updated: ExternalTrustIssuer = { ...existing, status, updatedAt: this.ctx.clock.now() };
    return this.store.putExternalIssuer(updated);
  }

  /** An issuer is acceptable to a trust domain only when it is trusted/limited, not suspended/revoked/unknown, and scoped to that domain. */
  isIssuerAcceptedByTrustDomain(externalIssuerId: string, trustDomainId: string): boolean {
    const issuer = this.store.getExternalIssuer(externalIssuerId);
    if (!issuer) {
      return false;
    }
    return issuer.acceptedByTrustDomainId === trustDomainId && (issuer.status === 'trusted' || issuer.status === 'limited');
  }

  getAcceptedIssuersForTrustDomain(trustDomainId: string): readonly ExternalTrustIssuer[] {
    return this.store
      .getExternalIssuersByTrustDomain(trustDomainId)
      .filter((issuer) => issuer.status === 'trusted' || issuer.status === 'limited');
  }

  isAgentTypeAllowed(externalIssuerId: string, agentType: ExternalAgentType): boolean {
    const issuer = this.store.getExternalIssuer(externalIssuerId);
    return issuer !== undefined && issuer.allowedAgentTypes.includes(agentType);
  }
}
