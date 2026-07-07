import type { AgentVisa } from '../domain/agent-visa.js';
import type { IngressGrant } from '../domain/ingress-grant.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { IngressGrantNotFoundError } from '../runtime/handshake-runtime-errors.js';
import type { HandshakeLedger } from './handshake-ledger.js';
import type { HandshakeStore } from './handshake-store.js';

export interface IssueIngressGrantInput {
  readonly id?: string;
  readonly agentVisaId: string;
  readonly localTrustDomainId: string;
  readonly externalAgentId: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly capabilities: readonly string[];
  readonly expiresAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface IngressGrantVerification {
  readonly valid: boolean;
  readonly grant?: IngressGrant;
  readonly reasonCode: string;
  readonly reason: string;
}

/**
 * Issues and governs IngressGrants -- the concrete action/scope/capability
 * bundle an active AgentVisa authorizes. An ingress grant can never exceed
 * what its parent visa allows; this service enforces that at issuance.
 */
export class IngressGrantService {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
    private readonly ledger: HandshakeLedger,
  ) {}

  issueIngressGrant(input: IssueIngressGrantInput, visa: AgentVisa): IngressGrant {
    const actions = input.actions.filter((action) => visa.allowedActions.includes(action));
    const resourceScopes = input.resourceScopes.filter((scope) => visa.allowedResourceScopes.includes(scope));
    const capabilities = input.capabilities.filter((capability) => visa.allowedCapabilities.includes(capability));

    const grant: IngressGrant = {
      id: input.id ?? this.ctx.ids.nextId('ingress-grant'),
      agentVisaId: input.agentVisaId,
      localTrustDomainId: input.localTrustDomainId,
      externalAgentId: input.externalAgentId,
      status: 'active',
      actions,
      resourceScopes,
      capabilities,
      issuedAt: this.ctx.clock.now(),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : visa.expiresAt !== undefined ? { expiresAt: visa.expiresAt } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    this.store.putIngressGrant(grant);

    this.ledger.recordEvent({
      type: 'ingress_grant_issued',
      localTrustDomainId: grant.localTrustDomainId,
      externalAgentId: grant.externalAgentId,
      visaId: grant.agentVisaId,
      ingressGrantId: grant.id,
      payload: { actions: grant.actions, resourceScopes: grant.resourceScopes, capabilities: grant.capabilities },
    });

    return grant;
  }

  getIngressGrant(ingressGrantId: string): IngressGrant | undefined {
    return this.store.getIngressGrant(ingressGrantId);
  }

  verifyIngressGrant(ingressGrantId: string, now: string, requested: { readonly action: string; readonly resourceScope: string }): IngressGrantVerification {
    const grant = this.store.getIngressGrant(ingressGrantId);
    if (!grant) {
      return { valid: false, reasonCode: 'INGRESS_NOT_FOUND', reason: `Ingress grant ${ingressGrantId} was not found.` };
    }
    if (grant.status === 'revoked') {
      return { valid: false, grant, reasonCode: 'INGRESS_REVOKED', reason: `Ingress grant ${ingressGrantId} was revoked.` };
    }
    if (grant.status === 'suspended') {
      return { valid: false, grant, reasonCode: 'INGRESS_SUSPENDED', reason: `Ingress grant ${ingressGrantId} is suspended.` };
    }
    if (grant.expiresAt !== undefined && Date.parse(now) >= Date.parse(grant.expiresAt)) {
      return { valid: false, grant, reasonCode: 'INGRESS_EXPIRED', reason: `Ingress grant ${ingressGrantId} expired at ${grant.expiresAt}.` };
    }
    if (!grant.actions.includes(requested.action)) {
      return { valid: false, grant, reasonCode: 'INGRESS_DENIED', reason: `Ingress grant ${ingressGrantId} does not cover action "${requested.action}".` };
    }
    if (!grant.resourceScopes.includes(requested.resourceScope)) {
      return { valid: false, grant, reasonCode: 'INGRESS_DENIED', reason: `Ingress grant ${ingressGrantId} does not cover scope "${requested.resourceScope}".` };
    }
    return { valid: true, grant, reasonCode: 'INGRESS_VALID', reason: `Ingress grant ${ingressGrantId} authorizes this action.` };
  }

  expireIngressGrant(ingressGrantId: string): IngressGrant {
    return this.transition(ingressGrantId, 'expired');
  }

  suspendIngressGrant(ingressGrantId: string): IngressGrant {
    return this.transition(ingressGrantId, 'suspended');
  }

  revokeIngressGrant(ingressGrantId: string, revokedByActorId: string, reason: string): IngressGrant {
    const existing = this.store.getIngressGrant(ingressGrantId);
    if (!existing) {
      throw new IngressGrantNotFoundError(ingressGrantId);
    }
    const revoked = this.store.updateIngressGrantStatus(ingressGrantId, 'revoked', {
      revokedAt: this.ctx.clock.now(),
      revokedByActorId,
      revocationReason: reason,
    });
    this.ledger.recordEvent({
      type: 'ingress_grant_revoked',
      localTrustDomainId: revoked.localTrustDomainId,
      externalAgentId: revoked.externalAgentId,
      visaId: revoked.agentVisaId,
      ingressGrantId: revoked.id,
      payload: { reason },
    });
    return revoked;
  }

  private transition(ingressGrantId: string, status: IngressGrant['status']): IngressGrant {
    const existing = this.store.getIngressGrant(ingressGrantId);
    if (!existing) {
      throw new IngressGrantNotFoundError(ingressGrantId);
    }
    return this.store.updateIngressGrantStatus(ingressGrantId, status);
  }
}
