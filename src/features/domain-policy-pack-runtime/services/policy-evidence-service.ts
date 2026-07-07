import type { PolicyEvidenceRequirement } from '../domain/policy-pack-evidence.js';
import type { PolicyEvaluationInput, PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';

export interface PolicyEvidenceCollectionResult {
  readonly requirements: readonly PolicyEvidenceRequirement[];
  readonly satisfied: boolean;
  readonly missingRequirementIds: readonly string[];
}

/**
 * Structural, non-lossy mapping of a PolicyEvidenceRequirement onto the
 * approval-runtime ApprovalEvidenceRequirement shape. This module never
 * imports approval-runtime types directly (that would create feature-to-
 * feature coupling); callers in approval-policy-pack-integration.ts own the
 * concrete type.
 */
export interface StructuralApprovalEvidenceRequirement {
  readonly id: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
}

const EVIDENCE_TYPE_TO_APPROVAL_EVIDENCE_TYPE: Readonly<Record<string, string>> = {
  contract: 'source_document',
  purchase_order: 'source_document',
  invoice: 'source_document',
  event_record: 'source_document',
  approval_memo: 'human_comment',
  authority_proof: 'authority_proof',
  identity_proof: 'source_document',
  customer_policy: 'source_document',
  data_classification: 'source_document',
  risk_assessment: 'policy_result',
  human_comment: 'human_comment',
  system_log: 'system_log',
  external_reference: 'external_reference',
};

/**
 * Collects and deduplicates PolicyEvidenceRequirements from matched rule
 * results, and identifies which are missing given the evidence already
 * attached to a PolicyEvaluationInput.
 */
export class PolicyEvidenceService {
  collect(ruleResults: readonly PolicyRuleEvaluationResult[], input: PolicyEvaluationInput): PolicyEvidenceCollectionResult {
    const seen = new Set<string>();
    const requirements: PolicyEvidenceRequirement[] = [];

    for (const result of ruleResults) {
      if (!result.matched) {
        continue;
      }
      for (const requirement of result.evidenceRequirements) {
        const dedupeKey = `${requirement.type}:${requirement.id}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        requirements.push(requirement);
      }
    }

    const providedEvidenceIds = new Set(input.evidenceIds ?? []);
    const missingRequirementIds = requirements
      .filter((requirement) => requirement.required)
      .filter((requirement) => !providedEvidenceIds.has(requirement.id) && input.hasRequiredEvidence !== true)
      .map((requirement) => requirement.id);

    return { requirements, satisfied: missingRequirementIds.length === 0, missingRequirementIds };
  }

  toStructuralApprovalEvidence(requirement: PolicyEvidenceRequirement): StructuralApprovalEvidenceRequirement {
    return {
      id: requirement.id,
      type: EVIDENCE_TYPE_TO_APPROVAL_EVIDENCE_TYPE[requirement.type] ?? 'source_document',
      required: requirement.required,
      description: requirement.description,
    };
  }
}
