export type ApprovalEventType =
  | 'approval_requested'
  | 'approvers_resolved'
  | 'approval_approved'
  | 'approval_rejected'
  | 'approval_changes_requested'
  | 'approval_escalated'
  | 'approval_expired'
  | 'approval_revoked'
  | 'approval_proof_created'
  | 'approval_verified'
  | 'approval_verification_failed';

export interface ApprovalEvent {
  readonly id: string;

  readonly type: ApprovalEventType;

  readonly trustDomainId: string;

  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;

  readonly actionRequestId?: string;

  readonly actorId?: string;
  readonly approverActorId?: string;
  readonly requestedByActorId?: string;

  readonly timestamp: string;

  readonly payload: Readonly<Record<string, unknown>>;

  readonly previousHash?: string;
  readonly eventHash: string;
}
