import type { AgentVisa } from '../domain/agent-visa.js';
import type { ExternalAgentStanding } from '../domain/external-agent-standing.js';
import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { IngressGrant } from '../domain/ingress-grant.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { HandshakeRequestNotFoundError } from '../runtime/handshake-runtime-errors.js';
import type { AgentVisaService } from './agent-visa-service.js';
import type { HandshakeLedger } from './handshake-ledger.js';
import type { HandshakeStore } from './handshake-store.js';
import type { IngressGrantService } from './ingress-grant-service.js';

/**
 * Revokes handshake requests, visas and ingress grants. Revocation always
 * wins and is permanent: it blocks all future use while preserving the
 * historical audit trail (the ledger and the revoked entity itself are never
 * deleted, only marked).
 */
export class HandshakeRevocationService {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
    private readonly ledger: HandshakeLedger,
    private readonly agentVisaService: AgentVisaService,
    private readonly ingressGrantService: IngressGrantService,
  ) {}

  revokeHandshakeRequest(handshakeRequestId: string, revokedByActorId: string, reason: string): HandshakeRequest {
    const existing = this.store.getHandshakeRequest(handshakeRequestId);
    if (!existing) {
      throw new HandshakeRequestNotFoundError(handshakeRequestId);
    }
    const revoked = this.store.updateHandshakeRequestStatus(handshakeRequestId, 'revoked');
    this.ledger.recordEvent({
      type: 'handshake_revoked',
      localTrustDomainId: revoked.localTrustDomainId,
      externalAgentId: revoked.externalAgent.id,
      handshakeRequestId: revoked.id,
      payload: { revokedByActorId, reason },
    });
    return revoked;
  }

  revokeAgentVisa(visaId: string, revokedByActorId: string, reason: string): AgentVisa {
    return this.agentVisaService.revokeAgentVisa(visaId, revokedByActorId, reason);
  }

  revokeIngressGrant(ingressGrantId: string, revokedByActorId: string, reason: string): IngressGrant {
    return this.ingressGrantService.revokeIngressGrant(ingressGrantId, revokedByActorId, reason);
  }

  revokeStanding(standing: ExternalAgentStanding, reasonCode: string, reason: string): ExternalAgentStanding {
    return this.store.putExternalAgentStanding({
      ...standing,
      type: 'revoked',
      reasonCode,
      reason,
      evaluatedAt: this.ctx.clock.now(),
    });
  }
}
