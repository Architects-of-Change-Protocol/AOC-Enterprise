import type { ExternalAuthorityPresentation, ExternalAuthorityPresentationStatus } from '../domain/external-authority-presentation.js';
import type { HandshakeAuthorityCheckResult } from '../domain/handshake-policy.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import type { HandshakeAuthorityGraphIntegration } from './handshake-authority-graph-integration.js';
import type { HandshakeStore } from './handshake-store.js';

export interface PresentAuthorityInput {
  readonly id?: string;
  readonly externalAgentId: string;
  readonly handshakeRequestId: string;
  readonly principalActorId?: string;
  readonly responsibleOrganizationId?: string;
  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly externalAuthorityProofId?: string;
  readonly proofHash?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const STATUS_BY_RESULT_TYPE: Readonly<Record<string, ExternalAuthorityPresentationStatus>> = {
  authority_valid: 'valid',
  authority_missing: 'missing',
  ancestor_expired: 'expired',
  ancestor_revoked: 'revoked',
  scope_expansion_detected: 'insufficient_scope',
};

/**
 * Validates the authority an external agent claims stands behind its
 * request. Never grants authority itself -- it either defers to Authority
 * Graph's structural integration (when configured) or, absent that, accepts
 * only a deterministic proof reference at face value per the MVP's
 * no-real-cryptography rule. Authority found valid here can never expand
 * beyond what the local TrustBoundary separately allows.
 */
export class AuthorityPresentationService {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
    private readonly authorityGraph?: HandshakeAuthorityGraphIntegration,
  ) {}

  presentAuthority(input: PresentAuthorityInput): ExternalAuthorityPresentation {
    const presentation: ExternalAuthorityPresentation = {
      id: input.id ?? this.ctx.ids.nextId('authority-presentation'),
      externalAgentId: input.externalAgentId,
      handshakeRequestId: input.handshakeRequestId,
      capability: input.capability,
      actions: input.actions,
      resourceScopes: input.resourceScopes,
      status: 'presented',
      presentedAt: this.ctx.clock.now(),
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(input.responsibleOrganizationId !== undefined ? { responsibleOrganizationId: input.responsibleOrganizationId } : {}),
      ...(input.externalAuthorityProofId !== undefined ? { externalAuthorityProofId: input.externalAuthorityProofId } : {}),
      ...(input.proofHash !== undefined ? { proofHash: input.proofHash } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    return this.store.putAuthorityPresentation(presentation);
  }

  getAuthorityPresentation(authorityPresentationId: string): ExternalAuthorityPresentation | undefined {
    return this.store.getAuthorityPresentation(authorityPresentationId);
  }

  /**
   * Verifies a presented authority claim, updating and persisting its status.
   * Returns a HandshakeAuthorityCheckResult usable directly by the policy
   * evaluator regardless of whether an Authority Graph integration is wired up.
   */
  verifyAuthorityPresentation(
    presentation: ExternalAuthorityPresentation,
    context: { readonly requestId: string; readonly trustDomainId: string; readonly requestedAt: string },
  ): HandshakeAuthorityCheckResult {
    if (this.authorityGraph) {
      const result = this.authorityGraph.verifyAuthority({
        requestId: context.requestId,
        actorId: presentation.principalActorId ?? presentation.externalAgentId,
        trustDomainId: context.trustDomainId,
        action: presentation.actions[0] ?? presentation.capability,
        resourceScope: presentation.resourceScopes[0] ?? '*',
        capability: presentation.capability,
        requestedAt: context.requestedAt,
        ...(presentation.principalActorId !== undefined ? { principalActorId: presentation.principalActorId } : {}),
      });
      const status = STATUS_BY_RESULT_TYPE[result.type] ?? (result.valid ? 'valid' : 'invalid');
      this.store.putAuthorityPresentation({ ...presentation, status });
      return {
        valid: result.valid,
        type: result.type,
        reasonCode: result.reasonCode,
        reason: result.reason,
        ...(result.authorityDecisionId !== undefined ? { authorityDecisionId: result.authorityDecisionId } : {}),
        ...(result.authorityProofId !== undefined ? { authorityProofId: result.authorityProofId } : {}),
      };
    }

    // No Authority Graph configured: the MVP accepts a deterministic proof reference at face value.
    if (presentation.externalAuthorityProofId !== undefined) {
      this.store.putAuthorityPresentation({ ...presentation, status: 'valid' });
      return { valid: true, type: 'authority_valid', reasonCode: 'AUTHORITY_VALID', reason: `Authority presentation ${presentation.id} carries a proof reference and is accepted.` };
    }
    this.store.putAuthorityPresentation({ ...presentation, status: 'missing' });
    return { valid: false, type: 'authority_missing', reasonCode: 'AUTHORITY_MISSING', reason: `Authority presentation ${presentation.id} carries no proof reference.` };
  }
}
