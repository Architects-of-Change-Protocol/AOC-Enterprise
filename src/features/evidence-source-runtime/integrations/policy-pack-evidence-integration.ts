import type { EvidenceRequirement, EvidenceRequirementType } from '../domain/evidence-requirement.js';
import type { EvidenceArtifact } from '../domain/evidence-artifact.js';
import type { EvidenceRuntime } from '../services/evidence-runtime.js';

/**
 * Structural mirror of Domain Policy Pack Runtime's PolicyEvidenceRequirement
 * (src/features/domain-policy-pack-runtime/domain/policy-pack-evidence.ts).
 * This module never imports that type directly -- the caller (a wiring
 * layer inside domain-policy-pack-runtime, action-enforcement, or a host
 * composing both runtimes) maps its own PolicyEvidenceRequirement array onto
 * `requirements` below.
 */
export interface PolicyPackEvidenceRequirementInput {
  readonly trustDomainId: string;
  readonly policyDecisionId?: string;
  readonly policyPackVersionId?: string;
  readonly sourceRuleId?: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly capability?: string;
  readonly resourceScope?: string;
  readonly requirements: ReadonlyArray<{
    readonly id: string;
    readonly type: string;
    readonly description: string;
    readonly required: boolean;
    readonly sourceRuleId?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }>;
}

export interface PolicyPackEvidenceSatisfactionResult {
  readonly satisfied: boolean;
  readonly requirementIds: readonly string[];
  readonly satisfiedRequirementIds: readonly string[];
  readonly missingRequirementIds: readonly string[];
  readonly rejectedEvidenceArtifactIds: readonly string[];
  readonly expiredEvidenceArtifactIds: readonly string[];
  readonly proofId?: string;
}

export interface PolicyPackEvidenceIntegration {
  /** Idempotently maps each PolicyEvidenceRequirement onto an EvidenceRequirement -- calling this again for the same policyDecisionId+requirement id returns the existing record rather than creating a duplicate. */
  mapPolicyEvidenceRequirements(input: PolicyPackEvidenceRequirementInput): readonly EvidenceRequirement[];
  /** Maps requirements, then checks the supplied evidenceArtifactIds against them by type and status, recording a real EvidenceSatisfaction for any type match found. Never re-evaluates the policy pack's own rules and never claims legal sufficiency -- it only reports evidence completeness. */
  validatePolicyEvidenceSatisfaction(input: PolicyPackEvidenceRequirementInput, evidenceArtifactIds?: readonly string[]): PolicyPackEvidenceSatisfactionResult;
}

const KNOWN_EVIDENCE_REQUIREMENT_TYPES: ReadonlySet<string> = new Set<EvidenceRequirementType>([
  'contract',
  'purchase_order',
  'invoice',
  'event_record',
  'approval_memo',
  'authority_proof',
  'identity_proof',
  'customer_policy',
  'data_classification',
  'risk_assessment',
  'human_comment',
  'system_log',
  'external_reference',
  'external_attestation',
  'manual_note',
  'other',
]);

function toEvidenceRequirementType(type: string): EvidenceRequirementType {
  return (KNOWN_EVIDENCE_REQUIREMENT_TYPES.has(type) ? type : 'other') as EvidenceRequirementType;
}

/**
 * Structural adapter Domain Policy Pack Runtime (or an Action Enforcement
 * host consulting both runtimes) can use to represent its own
 * PolicyEvidenceRequirements inside the Evidence / Source / Citation
 * Runtime, and to check whether evidence already on file satisfies them.
 * This integration never evaluates policy rules and never overrides a
 * policy pack decision -- it only represents and validates evidence.
 */
export function createPolicyPackEvidenceIntegration(runtime: EvidenceRuntime): PolicyPackEvidenceIntegration {
  function mapPolicyEvidenceRequirements(input: PolicyPackEvidenceRequirementInput): readonly EvidenceRequirement[] {
    return input.requirements.map((requirement) => {
      const existing = runtime.store
        .listRequirementsBySource('policy_pack')
        .find((candidate) => candidate.sourceRequirementId === requirement.id && candidate.policyDecisionId === input.policyDecisionId);
      if (existing) {
        return existing;
      }

      return runtime.requirements.fromPolicyPackRequirement({
        trustDomainId: input.trustDomainId,
        requirement: {
          id: requirement.id,
          type: toEvidenceRequirementType(requirement.type),
          description: requirement.description,
          required: requirement.required,
          ...(requirement.sourceRuleId !== undefined ? { sourceRuleId: requirement.sourceRuleId } : {}),
          ...(requirement.metadata !== undefined ? { metadata: requirement.metadata } : {}),
        },
        ...(input.policyDecisionId !== undefined ? { policyDecisionId: input.policyDecisionId } : {}),
        ...(input.policyPackVersionId !== undefined ? { policyPackVersionId: input.policyPackVersionId } : {}),
        ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
        ...(input.action !== undefined ? { action: input.action } : {}),
        ...(input.capability !== undefined ? { capability: input.capability } : {}),
        ...(input.resourceScope !== undefined ? { resourceScope: input.resourceScope } : {}),
      });
    });
  }

  function validatePolicyEvidenceSatisfaction(input: PolicyPackEvidenceRequirementInput, evidenceArtifactIds: readonly string[] = []): PolicyPackEvidenceSatisfactionResult {
    const requirements = mapPolicyEvidenceRequirements(input);
    const artifacts = evidenceArtifactIds
      .map((id) => runtime.store.getEvidenceArtifact(id))
      .filter((artifact): artifact is EvidenceArtifact => artifact !== undefined);

    const missingRequirementIds: string[] = [];
    const satisfiedRequirementIds: string[] = [];
    const rejectedEvidenceArtifactIds = new Set<string>();
    const expiredEvidenceArtifactIds = new Set<string>();

    for (const requirement of requirements) {
      if (requirement.status === 'satisfied' || requirement.status === 'partially_satisfied' || requirement.status === 'waived') {
        satisfiedRequirementIds.push(requirement.id);
        continue;
      }

      const matchingArtifacts = artifacts.filter((artifact) => artifact.type === requirement.type);
      if (matchingArtifacts.length === 0) {
        if (requirement.required) {
          missingRequirementIds.push(requirement.id);
        }
        continue;
      }

      const satisfaction = runtime.satisfyEvidenceRequirement({
        requirementId: requirement.id,
        evidenceArtifactIds: matchingArtifacts.map((artifact) => artifact.id),
        reasonCode: 'POLICY_PACK_EVIDENCE_PROVIDED',
        reason: `Evidence provided for policy pack requirement ${requirement.sourceRequirementId ?? requirement.id}.`,
      });

      if (satisfaction.status === 'satisfied' || satisfaction.status === 'partially_satisfied') {
        satisfiedRequirementIds.push(requirement.id);
        continue;
      }

      for (const artifact of matchingArtifacts) {
        if (artifact.status === 'rejected' || artifact.status === 'revoked') {
          rejectedEvidenceArtifactIds.add(artifact.id);
        }
        if (artifact.status === 'expired') {
          expiredEvidenceArtifactIds.add(artifact.id);
        }
      }
      if (requirement.required) {
        missingRequirementIds.push(requirement.id);
      }
    }

    return {
      satisfied: missingRequirementIds.length === 0 && rejectedEvidenceArtifactIds.size === 0 && expiredEvidenceArtifactIds.size === 0,
      requirementIds: requirements.map((requirement) => requirement.id),
      satisfiedRequirementIds,
      missingRequirementIds,
      rejectedEvidenceArtifactIds: [...rejectedEvidenceArtifactIds],
      expiredEvidenceArtifactIds: [...expiredEvidenceArtifactIds],
    };
  }

  return { mapPolicyEvidenceRequirements, validatePolicyEvidenceSatisfaction };
}
