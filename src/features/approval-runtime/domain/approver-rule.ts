import type { ApprovalRiskLevel } from './approval-requirement.js';

export interface ApproverRule {
  readonly id: string;

  readonly trustDomainId: string;

  readonly actionPattern: string;
  readonly resourceScopePattern?: string;

  readonly allowedApproverActorIds?: readonly string[];
  readonly allowedApproverRoleIds?: readonly string[];

  readonly requiredAuthorityCapability?: string;

  readonly minApprovals: number;

  readonly requiresDifferentActorFromRequester: boolean;
  readonly requiresDifferentActorFromBeneficiary: boolean;

  readonly allowedRiskLevels: readonly ApprovalRiskLevel[];

  readonly expiresInMinutes?: number;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
