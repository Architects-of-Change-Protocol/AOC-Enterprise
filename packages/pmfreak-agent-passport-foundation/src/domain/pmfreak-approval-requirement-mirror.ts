/**
 * Structural mirror of `ApprovalRequirement`
 * (`src/features/approval-runtime/domain/approval-requirement.ts`, together
 * with its nested `ApprovalEvidenceRequirement` from
 * `src/features/approval-runtime/domain/approval-evidence.ts`), re-scoped to
 * PMFreak's approval vocabulary.
 *
 * This module never imports `ApprovalRequirement` directly:
 * `src/features/approval-runtime` is internal to the root
 * `@aoc-enterprise/runtime` package and is not part of its public `exports`
 * map, so a separate `packages/*` workspace member has no legitimate import
 * path to it. The field shape is intentionally identical to the real
 * `ApprovalRequirement` so a future sprint that exports `approval-runtime`
 * from the root package's public surface can replace this mirror with a
 * real import.
 */
export type PMFreakApprovalRequirementType =
  | 'pm_approval'
  | 'project_sponsor_approval'
  | 'customer_validation'
  | 'commercial_review'
  | 'contract_review'
  | 'billing_review'
  | 'legal_review'
  | 'security_review'
  | 'executive_approval';

export type PMFreakApprovalRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PMFreakApprovalEvidenceRequirementMirror {
  readonly id: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
}

export interface PMFreakApprovalRequirementMirror {
  readonly id: string;
  readonly type: PMFreakApprovalRequirementType;
  readonly passportId: string;
  readonly role: string;
  readonly action: string;
  readonly riskLevel: PMFreakApprovalRiskLevel;
  readonly requiredApproverRoleIds?: readonly string[];
  readonly minimumApprovals: number;
  readonly requiresSegregationOfDuties: boolean;
  readonly evidenceRequirements: readonly PMFreakApprovalEvidenceRequirementMirror[];
  readonly expiresInMinutes?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
