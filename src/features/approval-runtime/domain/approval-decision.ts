import type { ApprovalEvidenceArtifact } from './approval-evidence.js';

export type ApprovalDecisionType =
  | 'approved'
  | 'rejected'
  | 'requested_changes'
  | 'escalated'
  | 'expired'
  | 'revoked'
  | 'invalid_approver'
  | 'insufficient_evidence'
  | 'out_of_scope'
  | 'conflict_of_interest'
  | 'quorum_not_met'
  | 'duplicate_approval';

export interface ApprovalDecision {
  readonly id: string;

  readonly approvalRequestId: string;
  readonly trustDomainId: string;

  readonly approverActorId: string;

  readonly type: ApprovalDecisionType;

  readonly approved: boolean;

  readonly reasonCode: string;
  readonly reason?: string;

  readonly evidenceReviewed: readonly ApprovalEvidenceArtifact[];

  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;

  readonly decidedAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
