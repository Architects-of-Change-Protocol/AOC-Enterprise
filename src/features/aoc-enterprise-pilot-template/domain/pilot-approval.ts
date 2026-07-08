export type PilotExpectedApprovalBehavior = 'not_required' | 'required' | 'approved' | 'rejected' | 'pending';

export interface PilotApprovalScenario {
  readonly action: string;
  readonly expectedApprovalBehavior: PilotExpectedApprovalBehavior;
  readonly description: string;
}

/**
 * Describes which Approval Runtime roles/requests/decisions/proofs a pilot
 * expects to be in play. `approvalScenarios` are pilot-authored
 * expectations; actual approval outcomes always come from Approval Runtime.
 */
export interface PilotApprovalModel {
  readonly approvalRoleIds: readonly string[];

  readonly approvalRequestIds: readonly string[];
  readonly approvalDecisionIds: readonly string[];
  readonly approvalProofIds: readonly string[];

  readonly approvalScenarios: readonly PilotApprovalScenario[];

  readonly walkthrough: readonly string[];
}
