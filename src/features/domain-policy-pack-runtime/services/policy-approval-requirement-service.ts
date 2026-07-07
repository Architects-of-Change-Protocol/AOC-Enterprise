import type { PolicyApprovalRequirement, PolicyApprovalRequirementType } from '../domain/policy-pack-approval.js';
import type { PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';

/**
 * Structural, non-lossy mapping of a PolicyApprovalRequirement onto the
 * approval-runtime ApprovalRequirement shape (readonly id/type/riskLevel/
 * trustDomainId/action/resourceScope/requiredApproverActorIds/
 * requiredApproverRoleIds/requiredAuthorityCapability/minimumApprovals/
 * requiresSegregationOfDuties/evidenceRequirements). This module never
 * imports approval-runtime types directly -- callers in
 * approval-policy-pack-integration.ts own the concrete type and complete
 * the trustDomainId/action/resourceScope/riskLevel/evidenceRequirements
 * fields that only the caller's context has.
 */
export interface StructuralApprovalRequirement {
  readonly id: string;
  readonly type: 'single_approval' | 'dual_approval' | 'quorum_approval' | 'role_based_approval' | 'authority_based_approval' | 'escalated_approval';
  readonly requiredApproverRoleIds?: readonly string[];
  readonly requiredApproverActorIds?: readonly string[];
  readonly requiredAuthorityCapability?: string;
  readonly minimumApprovals: number;
  readonly requiresSegregationOfDuties: boolean;
}

const APPROVAL_TYPE_MAP: Readonly<Record<PolicyApprovalRequirementType, StructuralApprovalRequirement['type']>> = {
  single_approval: 'single_approval',
  dual_approval: 'dual_approval',
  quorum_approval: 'quorum_approval',
  role_based_approval: 'role_based_approval',
  legal_review: 'authority_based_approval',
  finance_review: 'authority_based_approval',
  compliance_review: 'authority_based_approval',
  operator_review: 'authority_based_approval',
};

const REVIEW_TYPE_TO_AUTHORITY_CAPABILITY: Readonly<Record<string, string>> = {
  finance_review: 'approve_financial_action',
  legal_review: 'approve_critical_action',
  compliance_review: 'approve_critical_action',
  operator_review: 'approve_project_action',
};

/**
 * Collects and deduplicates PolicyApprovalRequirements from matched rule
 * results, and maps them structurally onto Approval Runtime's requirement
 * shape without weakening or bypassing Approval Runtime's own policies --
 * this service only *proposes* requirements; Approval Runtime decides how
 * to satisfy them.
 */
export class PolicyApprovalRequirementService {
  collect(ruleResults: readonly PolicyRuleEvaluationResult[]): readonly PolicyApprovalRequirement[] {
    const seen = new Set<string>();
    const requirements: PolicyApprovalRequirement[] = [];

    for (const result of ruleResults) {
      if (!result.matched) {
        continue;
      }
      for (const requirement of result.approvalRequirements) {
        if (seen.has(requirement.id)) {
          continue;
        }
        seen.add(requirement.id);
        requirements.push(requirement);
      }
    }

    return requirements;
  }

  toStructuralApprovalRequirement(requirement: PolicyApprovalRequirement): StructuralApprovalRequirement {
    const requiredAuthorityCapability =
      requirement.requiredAuthorityCapability ?? REVIEW_TYPE_TO_AUTHORITY_CAPABILITY[requirement.type];

    return {
      id: requirement.id,
      type: APPROVAL_TYPE_MAP[requirement.type],
      minimumApprovals: requirement.minimumApprovals,
      requiresSegregationOfDuties: requirement.requiresSegregationOfDuties,
      ...(requirement.requiredApproverRoleIds !== undefined ? { requiredApproverRoleIds: requirement.requiredApproverRoleIds } : {}),
      ...(requirement.requiredApproverActorIds !== undefined ? { requiredApproverActorIds: requirement.requiredApproverActorIds } : {}),
      ...(requiredAuthorityCapability !== undefined ? { requiredAuthorityCapability } : {}),
    };
  }
}
