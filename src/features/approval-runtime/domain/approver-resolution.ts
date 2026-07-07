export type ApproverResolutionStatus =
  | 'approvers_found'
  | 'no_valid_approver'
  | 'authority_missing'
  | 'out_of_scope'
  | 'conflict_of_interest';

export interface ApproverResolution {
  readonly id: string;

  readonly approvalRequestId: string;
  readonly trustDomainId: string;

  readonly status: ApproverResolutionStatus;

  readonly candidateApproverActorIds: readonly string[];
  readonly validApproverActorIds: readonly string[];
  readonly rejectedCandidateActorIds: readonly string[];

  readonly reasonCode: string;
  readonly reason: string;

  readonly evaluatedAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
