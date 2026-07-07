export type PolicyApprovalRequirementType =
  | 'single_approval'
  | 'dual_approval'
  | 'quorum_approval'
  | 'role_based_approval'
  | 'legal_review'
  | 'finance_review'
  | 'compliance_review'
  | 'operator_review';

export interface PolicyApprovalRequirement {
  readonly id: string;
  readonly type: PolicyApprovalRequirementType;
  readonly description: string;
  readonly required: boolean;
  readonly requiredApproverRoleIds?: readonly string[];
  readonly requiredApproverActorIds?: readonly string[];
  readonly requiredAuthorityCapability?: string;
  readonly minimumApprovals: number;
  readonly requiresSegregationOfDuties: boolean;
  readonly sourceRuleId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
