import type { ApprovalEvidenceArtifact } from './approval-evidence.js';

export interface ApprovalVerificationInput {
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

  readonly evidence?: readonly ApprovalEvidenceArtifact[];
}

export type ApprovalVerificationResultType =
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

export interface ApprovalVerificationResult {
  readonly type: ApprovalVerificationResultType;
  readonly valid: boolean;

  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;

  readonly reasonCode: string;
  readonly reason: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
