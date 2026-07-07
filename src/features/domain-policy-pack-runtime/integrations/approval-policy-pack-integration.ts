import type { PolicyApprovalRequirement } from '../domain/policy-pack-approval.js';
import type { PolicyEvidenceRequirement } from '../domain/policy-pack-evidence.js';
import type { PolicyRiskLevel } from '../domain/policy-pack-effect.js';
import {
  PolicyApprovalRequirementService,
  type StructuralApprovalRequirement,
} from '../services/policy-approval-requirement-service.js';
import { PolicyEvidenceService, type StructuralApprovalEvidenceRequirement } from '../services/policy-evidence-service.js';

export interface PolicyApprovalMappingContext {
  readonly trustDomainId: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly riskLevel: PolicyRiskLevel;
}

export interface PolicyApprovalMappingInput extends PolicyApprovalMappingContext {
  readonly approvalRequirements: readonly PolicyApprovalRequirement[];
  readonly evidenceRequirements?: readonly PolicyEvidenceRequirement[];
}

/**
 * Structural, non-lossy shape matching approval-runtime's ApprovalRequirement
 * (id/type/trustDomainId/action/resourceScope/riskLevel/
 * requiredApproverActorIds/requiredApproverRoleIds/
 * requiredAuthorityCapability/minimumApprovals/requiresSegregationOfDuties/
 * evidenceRequirements). This module never imports approval-runtime's
 * concrete ApprovalRequirement type -- the caller assigns this object
 * directly onto that type (every field name and type matches) or passes it
 * through its own construction path.
 */
export interface StructuralApprovalRuntimeRequirement extends StructuralApprovalRequirement, PolicyApprovalMappingContext {
  readonly evidenceRequirements: readonly StructuralApprovalEvidenceRequirement[];
}

export interface ApprovalPolicyPackIntegration {
  mapPolicyApprovalRequirements(input: PolicyApprovalMappingInput): readonly StructuralApprovalRuntimeRequirement[];
}

/**
 * Structural adapter Approval Runtime can optionally consult to enrich (not
 * replace) its own ApprovalRequirements with ones a policy pack proposed.
 * This never weakens Approval Runtime's own policies: it only *proposes*
 * additional requirements for Approval Runtime to fold in via its own
 * requirement-resolution path; Approval Runtime still decides who may
 * approve, still enforces segregation of duties, and still produces its own
 * ApprovalDecision/ApprovalProof.
 */
export function createApprovalPolicyPackIntegration(): ApprovalPolicyPackIntegration {
  const approvalService = new PolicyApprovalRequirementService();
  const evidenceService = new PolicyEvidenceService();

  return {
    mapPolicyApprovalRequirements(input: PolicyApprovalMappingInput): readonly StructuralApprovalRuntimeRequirement[] {
      const evidenceRequirements = (input.evidenceRequirements ?? []).map((requirement) =>
        evidenceService.toStructuralApprovalEvidence(requirement),
      );

      return input.approvalRequirements.map((requirement) => {
        const structural = approvalService.toStructuralApprovalRequirement(requirement);
        return {
          ...structural,
          trustDomainId: input.trustDomainId,
          action: input.action,
          resourceScope: input.resourceScope,
          riskLevel: input.riskLevel,
          evidenceRequirements,
        };
      });
    },
  };
}
