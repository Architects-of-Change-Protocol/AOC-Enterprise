/**
 * Structural adapter for the Approval Runtime. External Agent Handshake does
 * not import Approval Runtime's domain types directly -- it only needs
 * something shaped like ApprovalRuntime.createApprovalRequestForDecision /
 * .verifyApprovalForAction, so the two features stay loosely coupled. Mirrors
 * recognition-runtime/services/approval-runtime-integration.ts.
 */
export type HandshakeApprovalRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface HandshakeApprovalRequestInput {
  readonly handshakeRequestId: string;
  readonly localTrustDomainId: string;
  readonly requestedByActorId: string;
  readonly targetActorId: string;
  readonly principalActorId?: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;
  readonly riskLevel: HandshakeApprovalRiskLevel;
}

export type HandshakeApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked' | 'cancelled' | 'superseded';

export interface HandshakeApprovalRequestReference {
  readonly approvalRequestId: string;
  readonly status: HandshakeApprovalRequestStatus;
}

export interface HandshakeApprovalVerificationInput {
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;

  readonly handshakeRequestId: string;
  readonly localTrustDomainId: string;
  readonly externalAgentId: string;

  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;

  readonly requestedAt: string;
}

export type HandshakeApprovalVerificationResultType =
  | 'approval_valid'
  | 'approval_missing'
  | 'approval_invalid'
  | 'approval_expired'
  | 'approval_revoked'
  | 'invalid_approver'
  | 'approval_out_of_scope'
  | 'approval_insufficient_evidence'
  | 'segregation_of_duties_violation'
  | 'approval_quorum_not_met';

export interface HandshakeApprovalVerificationResult {
  readonly type: HandshakeApprovalVerificationResultType;
  readonly valid: boolean;

  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;

  readonly reasonCode: string;
  readonly reason: string;
}

export interface HandshakeApprovalRuntimeIntegration {
  createApprovalRequestForHandshake(input: HandshakeApprovalRequestInput): HandshakeApprovalRequestReference;
  verifyApprovalForHandshake(input: HandshakeApprovalVerificationInput): HandshakeApprovalVerificationResult;
}

/**
 * ApprovalRuntime's real createApprovalRequestForDecision/verifyApprovalForAction
 * shapes, expressed structurally rather than by importing approval-runtime's types.
 */
export interface ApprovalRuntimeLike {
  createApprovalRequestForDecision(input: {
    readonly recognitionDecisionId: string;
    readonly actionRequestId: string;
    readonly trustDomainId: string;
    readonly requestedByActorId: string;
    readonly targetActorId: string;
    readonly principalActorId?: string;
    readonly action: string;
    readonly resourceScope: string;
    readonly capability?: string;
    readonly riskLevel: HandshakeApprovalRiskLevel;
  }): { readonly approvalRequestId: string; readonly status: HandshakeApprovalRequestStatus };

  verifyApprovalForAction(input: {
    readonly approvalProofId?: string;
    readonly approvalRequestId?: string;
    readonly approvalDecisionId?: string;
    readonly actionRequestId: string;
    readonly actorId: string;
    readonly principalActorId?: string;
    readonly trustDomainId: string;
    readonly action: string;
    readonly resourceScope: string;
    readonly capability?: string;
    readonly requestedAt: string;
  }): {
    readonly type: HandshakeApprovalVerificationResultType;
    readonly valid: boolean;
    readonly approvalRequestId?: string;
    readonly approvalDecisionId?: string;
    readonly approvalProofId?: string;
    readonly reasonCode: string;
    readonly reason: string;
  };
}

/** Adapts an ApprovalRuntime-shaped object into a HandshakeApprovalRuntimeIntegration. */
export function createHandshakeApprovalRuntimeIntegration(approvalRuntime: ApprovalRuntimeLike): HandshakeApprovalRuntimeIntegration {
  return {
    createApprovalRequestForHandshake(input: HandshakeApprovalRequestInput): HandshakeApprovalRequestReference {
      const reference = approvalRuntime.createApprovalRequestForDecision({
        recognitionDecisionId: input.handshakeRequestId,
        actionRequestId: input.handshakeRequestId,
        trustDomainId: input.localTrustDomainId,
        requestedByActorId: input.requestedByActorId,
        targetActorId: input.targetActorId,
        action: input.action,
        resourceScope: input.resourceScope,
        riskLevel: input.riskLevel,
        ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
        ...(input.capability !== undefined ? { capability: input.capability } : {}),
      });
      return { approvalRequestId: reference.approvalRequestId, status: reference.status };
    },

    verifyApprovalForHandshake(input: HandshakeApprovalVerificationInput): HandshakeApprovalVerificationResult {
      const result = approvalRuntime.verifyApprovalForAction({
        actionRequestId: input.handshakeRequestId,
        actorId: input.externalAgentId,
        trustDomainId: input.localTrustDomainId,
        action: input.action,
        resourceScope: input.resourceScope,
        requestedAt: input.requestedAt,
        ...(input.approvalProofId !== undefined ? { approvalProofId: input.approvalProofId } : {}),
        ...(input.approvalRequestId !== undefined ? { approvalRequestId: input.approvalRequestId } : {}),
        ...(input.approvalDecisionId !== undefined ? { approvalDecisionId: input.approvalDecisionId } : {}),
        ...(input.capability !== undefined ? { capability: input.capability } : {}),
      });
      return {
        type: result.type,
        valid: result.valid,
        reasonCode: result.reasonCode,
        reason: result.reason,
        ...(result.approvalRequestId !== undefined ? { approvalRequestId: result.approvalRequestId } : {}),
        ...(result.approvalDecisionId !== undefined ? { approvalDecisionId: result.approvalDecisionId } : {}),
        ...(result.approvalProofId !== undefined ? { approvalProofId: result.approvalProofId } : {}),
      };
    },
  };
}
