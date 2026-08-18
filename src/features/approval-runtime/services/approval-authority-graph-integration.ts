/**
 * Structural adapter for the Authority Graph runtime. Approval Runtime does not
 * import Authority Graph's domain types directly -- it only needs something
 * shaped like AuthorityGraphRuntime.verifyAuthority, so the two features stay
 * loosely coupled. Mirrors recognition-runtime/services/authority-graph-integration.ts.
 */
export interface ApprovalAuthorityVerificationInput {
  readonly requestId: string;
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly trustDomainId: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;
  readonly requestedAt: string;
}

export type ApprovalAuthorityVerificationResultType =
  | 'authority_valid'
  | 'authority_missing'
  | 'issuer_not_authorized'
  | 'delegation_not_allowed'
  | 'delegation_depth_exceeded'
  | 'scope_expansion_detected'
  | 'non_delegable_action'
  | 'ancestor_revoked'
  | 'ancestor_expired'
  | 'self_issuance_detected'
  | 'delegation_lineage_broken'
  | 'cross_domain_authority_denied';

export interface ApprovalAuthorityVerificationResult {
  readonly type: ApprovalAuthorityVerificationResultType;
  readonly valid: boolean;
  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;
  readonly reasonCode: string;
  readonly reason: string;
}

export interface ApprovalAuthorityGraphIntegration {
  verifyAuthority(input: ApprovalAuthorityVerificationInput): ApprovalAuthorityVerificationResult;
}

/**
 * Authority Graph's AuthorityChainRequest/AuthorityDecision shapes use `id`
 * instead of `requestId` and `proofId` instead of `authorityProofId`. This
 * local shape is what AuthorityGraphRuntime.verifyAuthority actually accepts
 * and returns -- structurally, not by import.
 */
export interface AuthorityChainRequestLike {
  readonly id: string;
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly trustDomainId: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;
  readonly requestedAt: string;
}

export interface AuthorityDecisionLike {
  readonly id: string;
  readonly type: ApprovalAuthorityVerificationResultType;
  readonly valid: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly proofId?: string;
}

export interface AuthorityGraphRuntimeLike {
  verifyAuthority(request: AuthorityChainRequestLike): AuthorityDecisionLike;
}

/** Adapts an AuthorityGraphRuntime-shaped object into an ApprovalAuthorityGraphIntegration. */
export function createApprovalAuthorityGraphIntegration(authorityGraph: AuthorityGraphRuntimeLike): ApprovalAuthorityGraphIntegration {
  return {
    verifyAuthority(input: ApprovalAuthorityVerificationInput): ApprovalAuthorityVerificationResult {
      const decision = authorityGraph.verifyAuthority({
        id: input.requestId,
        actorId: input.actorId,
        trustDomainId: input.trustDomainId,
        action: input.action,
        resourceScope: input.resourceScope,
        requestedAt: input.requestedAt,
        ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
        ...(input.capability !== undefined ? { capability: input.capability } : {}),
      });
      return {
        type: decision.type,
        valid: decision.valid,
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        authorityDecisionId: decision.id,
        ...(decision.proofId !== undefined ? { authorityProofId: decision.proofId } : {}),
      };
    },
  };
}
