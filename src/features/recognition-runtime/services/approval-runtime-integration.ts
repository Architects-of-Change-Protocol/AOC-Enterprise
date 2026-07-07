/**
 * Structural adapter for the Approval Runtime. Recognition Runtime does not
 * import Approval Runtime's domain types directly -- it only needs something
 * shaped like ApprovalRuntime.verifyApprovalForAction (and, optionally,
 * .createApprovalRequestForDecision), so the two features stay loosely
 * coupled. Mirrors authority-graph-integration.ts.
 */
export interface RecognitionApprovalVerificationInput {
  readonly approvalProofId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;

  readonly actionRequestId: string;
  readonly recognitionDecisionId?: string;

  readonly actorId: string;
  readonly principalActorId?: string;

  readonly trustDomainId: string;

  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;

  readonly requestedAt: string;
}

export type RecognitionApprovalVerificationResultType =
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

export interface RecognitionApprovalVerificationResult {
  readonly type: RecognitionApprovalVerificationResultType;
  readonly valid: boolean;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;
  readonly reasonCode: string;
  readonly reason: string;
}

export type CreateApprovalRequestForDecisionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CreateApprovalRequestForDecisionInput {
  readonly recognitionDecisionId: string;
  readonly actionRequestId: string;
  readonly trustDomainId: string;
  readonly requestedByActorId: string;
  readonly targetActorId: string;
  readonly principalActorId?: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;
  readonly riskLevel: CreateApprovalRequestForDecisionRiskLevel;
}

export type ApprovalRequestReferenceStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked' | 'cancelled' | 'superseded';

export interface ApprovalRequestReference {
  readonly approvalRequestId: string;
  readonly status: ApprovalRequestReferenceStatus;
}

export interface ApprovalRuntimeIntegration {
  verifyApprovalForAction(input: RecognitionApprovalVerificationInput): RecognitionApprovalVerificationResult;
  createApprovalRequestForDecision?(input: CreateApprovalRequestForDecisionInput): ApprovalRequestReference;
}

/**
 * Approval evaluation only ever runs once Recognition's own policy chain (and
 * Authority Graph, when configured) has already settled on
 * 'require_human_approval' -- never for denials, missing-evidence, or an
 * already-clean 'allow'.
 */
export const APPROVAL_EVALUATION_DECISION_TYPE = 'require_human_approval';

const HARD_BLOCK_RESULT_TYPES: ReadonlySet<RecognitionApprovalVerificationResultType> = new Set([
  'approval_invalid',
  'approval_revoked',
  'invalid_approver',
  'approval_out_of_scope',
  'segregation_of_duties_violation',
]);

/** Whether a non-valid approval verification result should hard-block the action as a policy violation, vs. simply keep it pending human approval. */
export function isHardBlockingApprovalResult(type: RecognitionApprovalVerificationResultType): boolean {
  return HARD_BLOCK_RESULT_TYPES.has(type);
}
