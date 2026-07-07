import type { AgentVisa } from '../domain/agent-visa.js';
import type { HandshakeChallenge } from '../domain/handshake-challenge.js';
import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { HandshakeSession } from '../domain/handshake-session.js';
import type { IngressGrant } from '../domain/ingress-grant.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import type { AgentVisaService } from './agent-visa-service.js';
import type { HandshakeStore } from './handshake-store.js';
import type { IngressGrantService } from './ingress-grant-service.js';

const OPEN_REQUEST_STATUSES = new Set(['submitted', 'challenged', 'verifying', 'requires_approval']);
const OPEN_SESSION_STATUSES = new Set(['open', 'challenged', 'verifying']);

/**
 * Sweeps every expirable External Agent Handshake entity (requests,
 * challenges, sessions, visas, ingress grants) against the injected clock
 * only -- never Date.now(). Expiration always wins: an expired entity can
 * never validate again regardless of what it previously allowed.
 */
export class HandshakeExpirationService {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
    private readonly agentVisaService: AgentVisaService,
    private readonly ingressGrantService: IngressGrantService,
  ) {}

  isRequestExpired(request: HandshakeRequest, now: string): boolean {
    return request.expiresAt !== undefined && Date.parse(now) >= Date.parse(request.expiresAt);
  }

  isChallengeExpired(challenge: HandshakeChallenge, now: string): boolean {
    return challenge.expiresAt !== undefined && Date.parse(now) >= Date.parse(challenge.expiresAt);
  }

  isSessionExpired(session: HandshakeSession, now: string): boolean {
    return session.expiresAt !== undefined && Date.parse(now) >= Date.parse(session.expiresAt);
  }

  isVisaExpired(visa: AgentVisa, now: string): boolean {
    return visa.expiresAt !== undefined && Date.parse(now) >= Date.parse(visa.expiresAt);
  }

  isIngressGrantExpired(grant: IngressGrant, now: string): boolean {
    return grant.expiresAt !== undefined && Date.parse(now) >= Date.parse(grant.expiresAt);
  }

  expireHandshakeRequestIfNeeded(handshakeRequestId: string): HandshakeRequest | undefined {
    const request = this.store.getHandshakeRequest(handshakeRequestId);
    if (!request || !OPEN_REQUEST_STATUSES.has(request.status)) {
      return request;
    }
    const now = this.ctx.clock.now();
    if (!this.isRequestExpired(request, now)) {
      return request;
    }
    return this.store.updateHandshakeRequestStatus(handshakeRequestId, 'expired');
  }

  expireHandshakeSessionIfNeeded(handshakeSessionId: string): HandshakeSession | undefined {
    const session = this.store.getHandshakeSession(handshakeSessionId);
    if (!session || !OPEN_SESSION_STATUSES.has(session.status)) {
      return session;
    }
    const now = this.ctx.clock.now();
    if (!this.isSessionExpired(session, now)) {
      return session;
    }
    return this.store.updateHandshakeSessionStatus(handshakeSessionId, 'expired');
  }

  expireAgentVisaIfNeeded(visaId: string): AgentVisa | undefined {
    const visa = this.store.getAgentVisa(visaId);
    if (!visa || visa.status !== 'active') {
      return visa;
    }
    const now = this.ctx.clock.now();
    if (!this.isVisaExpired(visa, now)) {
      return visa;
    }
    return this.agentVisaService.expireAgentVisa(visaId);
  }

  expireIngressGrantIfNeeded(ingressGrantId: string): IngressGrant | undefined {
    const grant = this.store.getIngressGrant(ingressGrantId);
    if (!grant || grant.status !== 'active') {
      return grant;
    }
    const now = this.ctx.clock.now();
    if (!this.isIngressGrantExpired(grant, now)) {
      return grant;
    }
    return this.ingressGrantService.expireIngressGrant(ingressGrantId);
  }
}
