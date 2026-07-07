import type { AgentVisa } from '../domain/agent-visa.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { AgentVisaNotFoundError } from '../runtime/handshake-runtime-errors.js';
import type { HandshakeLedger } from './handshake-ledger.js';
import type { HandshakeStore } from './handshake-store.js';

export interface IssueAgentVisaInput {
  readonly id?: string;
  readonly handshakeRequestId: string;
  readonly handshakeDecisionId: string;
  readonly localTrustDomainId: string;
  readonly externalAgentId: string;
  readonly localActorId?: string;
  readonly externalIssuerId?: string;
  readonly externalTrustDomainId?: string;
  readonly allowedCapabilities: readonly string[];
  readonly allowedActions: readonly string[];
  readonly allowedResourceScopes: readonly string[];
  readonly dataDomains?: readonly string[];
  readonly ttlMinutes?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentVisaVerification {
  readonly valid: boolean;
  readonly visa?: AgentVisa;
  readonly reasonCode: string;
  readonly reason: string;
}

/**
 * Issues and governs AgentVisas -- the bounded, time-limited grant of local
 * standing an external agent receives once its handshake is accepted. A visa
 * can never claim more than the HandshakeDecision that produced it allowed.
 */
export class AgentVisaService {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
    private readonly ledger: HandshakeLedger,
  ) {}

  issueAgentVisa(input: IssueAgentVisaInput): AgentVisa {
    const now = this.ctx.clock.now();
    const expiresAt = input.ttlMinutes !== undefined ? new Date(Date.parse(now) + input.ttlMinutes * 60_000).toISOString() : undefined;

    const visa: AgentVisa = {
      id: input.id ?? this.ctx.ids.nextId('agent-visa'),
      handshakeRequestId: input.handshakeRequestId,
      handshakeDecisionId: input.handshakeDecisionId,
      localTrustDomainId: input.localTrustDomainId,
      externalAgentId: input.externalAgentId,
      status: 'active',
      allowedCapabilities: input.allowedCapabilities,
      allowedActions: input.allowedActions,
      allowedResourceScopes: input.allowedResourceScopes,
      issuedAt: now,
      ...(input.localActorId !== undefined ? { localActorId: input.localActorId } : {}),
      ...(input.externalIssuerId !== undefined ? { externalIssuerId: input.externalIssuerId } : {}),
      ...(input.externalTrustDomainId !== undefined ? { externalTrustDomainId: input.externalTrustDomainId } : {}),
      ...(input.dataDomains !== undefined ? { dataDomains: input.dataDomains } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    this.store.putAgentVisa(visa);

    this.ledger.recordEvent({
      type: 'agent_visa_issued',
      localTrustDomainId: visa.localTrustDomainId,
      externalAgentId: visa.externalAgentId,
      handshakeRequestId: visa.handshakeRequestId,
      handshakeDecisionId: visa.handshakeDecisionId,
      visaId: visa.id,
      payload: { allowedCapabilities: visa.allowedCapabilities, allowedActions: visa.allowedActions, allowedResourceScopes: visa.allowedResourceScopes },
    });

    return visa;
  }

  getAgentVisa(visaId: string): AgentVisa | undefined {
    return this.store.getAgentVisa(visaId);
  }

  verifyAgentVisa(visaId: string, now: string): AgentVisaVerification {
    const visa = this.store.getAgentVisa(visaId);
    if (!visa) {
      return { valid: false, reasonCode: 'VISA_NOT_FOUND', reason: `Agent visa ${visaId} was not found.` };
    }
    if (visa.status === 'revoked') {
      return { valid: false, visa, reasonCode: 'VISA_REVOKED', reason: `Agent visa ${visaId} was revoked.` };
    }
    if (visa.status === 'suspended') {
      return { valid: false, visa, reasonCode: 'VISA_SUSPENDED', reason: `Agent visa ${visaId} is suspended.` };
    }
    if (visa.status === 'expired' || (visa.expiresAt !== undefined && Date.parse(now) >= Date.parse(visa.expiresAt))) {
      const reason = visa.expiresAt !== undefined ? `Agent visa ${visaId} expired at ${visa.expiresAt}.` : `Agent visa ${visaId} has expired.`;
      return { valid: false, visa, reasonCode: 'VISA_EXPIRED', reason };
    }
    if (visa.status !== 'active') {
      return { valid: false, visa, reasonCode: 'VISA_INVALID', reason: `Agent visa ${visaId} is not active.` };
    }
    return { valid: true, visa, reasonCode: 'VISA_VALID', reason: `Agent visa ${visaId} is valid.` };
  }

  expireAgentVisa(visaId: string): AgentVisa {
    const expired = this.transition(visaId, 'expired');
    this.ledger.recordEvent({
      type: 'agent_visa_expired',
      localTrustDomainId: expired.localTrustDomainId,
      externalAgentId: expired.externalAgentId,
      visaId: expired.id,
      payload: {},
    });
    return expired;
  }

  suspendAgentVisa(visaId: string): AgentVisa {
    return this.transition(visaId, 'suspended');
  }

  revokeAgentVisa(visaId: string, revokedByActorId: string, reason: string): AgentVisa {
    const existing = this.store.getAgentVisa(visaId);
    if (!existing) {
      throw new AgentVisaNotFoundError(visaId);
    }
    const revoked = this.store.updateAgentVisaStatus(visaId, 'revoked', {
      revokedAt: this.ctx.clock.now(),
      revokedByActorId,
      revocationReason: reason,
    });
    this.ledger.recordEvent({
      type: 'agent_visa_revoked',
      localTrustDomainId: revoked.localTrustDomainId,
      externalAgentId: revoked.externalAgentId,
      visaId: revoked.id,
      payload: { reason },
    });
    return revoked;
  }

  private transition(visaId: string, status: AgentVisa['status']): AgentVisa {
    const existing = this.store.getAgentVisa(visaId);
    if (!existing) {
      throw new AgentVisaNotFoundError(visaId);
    }
    return this.store.updateAgentVisaStatus(visaId, status);
  }
}
