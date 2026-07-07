import type { ApprovalEvidenceRequirement } from './approval-evidence.js';

export type ApprovalRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ApprovalRequirementType =
  | 'single_approval'
  | 'dual_approval'
  | 'quorum_approval'
  | 'role_based_approval'
  | 'authority_based_approval'
  | 'escalated_approval';

export interface ApprovalRequirement {
  readonly id: string;

  readonly type: ApprovalRequirementType;

  readonly trustDomainId: string;

  readonly action: string;
  readonly resourceScope: string;
  readonly riskLevel: ApprovalRiskLevel;

  readonly requiredApproverActorIds?: readonly string[];
  readonly requiredApproverRoleIds?: readonly string[];

  readonly requiredAuthorityCapability?: string;

  readonly minimumApprovals: number;

  readonly requiresSegregationOfDuties: boolean;

  readonly evidenceRequirements: readonly ApprovalEvidenceRequirement[];

  readonly expiresInMinutes?: number;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
