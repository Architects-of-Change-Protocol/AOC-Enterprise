import type { EvidenceRequirement } from '../domain/evidence-requirement.js';
import type { EvidenceRuntime } from '../services/evidence-runtime.js';

export type EnforcementEvidenceCheckResultType = 'evidence_satisfied' | 'evidence_missing' | 'evidence_rejected' | 'evidence_expired';

/**
 * Structural input mirroring the fields Action Enforcement's
 * EnforcementDecision carries for an `evidence_required` outcome
 * (src/features/action-enforcement/domain/enforcement-decision.ts). This
 * module never imports EnforcementDecision/EnforcementRequest directly.
 */
export interface EnforcementEvidenceRequiredInput {
  readonly trustDomainId: string;
  readonly enforcementDecisionId: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly resourceScope?: string;
  readonly description: string;
  readonly type?: string;
}

export interface EnforcementEvidenceCheckInput {
  readonly enforcementDecisionId: string;
  readonly requirementIds: readonly string[];
  /** Evidence artifact ids the caller supplied on retry (structurally, EnforcementRequest.policyEvaluationInput.evidenceIds). */
  readonly evidenceArtifactIds: readonly string[];
}

export interface EnforcementEvidenceCheckResult {
  readonly type: EnforcementEvidenceCheckResultType;
  readonly satisfied: boolean;
  readonly missingRequirementIds: readonly string[];
  readonly rejectedEvidenceArtifactIds: readonly string[];
  readonly expiredEvidenceArtifactIds: readonly string[];
  readonly reasonCode: string;
  readonly reason: string;
  readonly evidenceValidationId: string;
  readonly evidenceProofId?: string;
}

export interface ActionEnforcementEvidenceIntegration {
  /** Idempotently maps an `evidence_required` enforcement outcome onto an EvidenceRequirement. */
  mapEvidenceRequiredDecision(input: EnforcementEvidenceRequiredInput): EvidenceRequirement;
  /**
   * Attaches any type-matching supplied evidence artifacts to their
   * requirements, then reports evidence_satisfied/missing/rejected/expired.
   * This function never blocks or allows execution by itself: it is purely
   * advisory. Action Enforcement's own default-deny chain always owns the
   * actual EnforcementDecision, and a caller must rerun enforcement to act
   * on this result -- evidence satisfaction here can never retroactively
   * flip an EnforcementDecision Action Enforcement already made.
   */
  checkEvidenceForEnforcementRequest(input: EnforcementEvidenceCheckInput): EnforcementEvidenceCheckResult;
}

/**
 * Structural adapter Action Enforcement (or a host composing both runtimes)
 * can use to represent an `evidence_required` decision's evidence need and
 * to check whether evidence supplied on retry satisfies it.
 */
export function createActionEnforcementEvidenceIntegration(runtime: EvidenceRuntime): ActionEnforcementEvidenceIntegration {
  return {
    mapEvidenceRequiredDecision(input: EnforcementEvidenceRequiredInput): EvidenceRequirement {
      const existing = runtime.store
        .listRequirementsBySource('action_enforcement')
        .find((candidate) => candidate.enforcementDecisionId === input.enforcementDecisionId && candidate.description === input.description);
      if (existing) {
        return existing;
      }

      return runtime.requirements.fromEnforcementRequirement({
        trustDomainId: input.trustDomainId,
        enforcementDecisionId: input.enforcementDecisionId,
        requirement: {
          id: `${input.enforcementDecisionId}-evidence`,
          type: (input.type as EvidenceRequirement['type']) ?? 'other',
          description: input.description,
          required: true,
        },
        ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
        ...(input.action !== undefined ? { action: input.action } : {}),
        ...(input.resourceScope !== undefined ? { resourceScope: input.resourceScope } : {}),
      });
    },

    checkEvidenceForEnforcementRequest(input: EnforcementEvidenceCheckInput): EnforcementEvidenceCheckResult {
      for (const requirementId of input.requirementIds) {
        const requirement = runtime.requirements.get(requirementId);
        if (!requirement || requirement.status === 'satisfied' || requirement.status === 'partially_satisfied' || requirement.status === 'waived') {
          continue;
        }
        const matchingArtifactIds = input.evidenceArtifactIds.filter((id) => runtime.evidenceArtifacts.get(id)?.type === requirement.type);
        if (matchingArtifactIds.length > 0) {
          runtime.satisfyEvidenceRequirement({
            requirementId,
            evidenceArtifactIds: matchingArtifactIds,
            reasonCode: 'ENFORCEMENT_EVIDENCE_PROVIDED',
            reason: `Evidence provided for enforcement decision ${input.enforcementDecisionId}.`,
          });
        }
      }

      const validation = runtime.validateEvidenceForTarget({
        requirementIds: input.requirementIds,
        targetType: 'enforcement_decision',
        targetId: input.enforcementDecisionId,
      });

      const type: EnforcementEvidenceCheckResultType = validation.valid
        ? 'evidence_satisfied'
        : validation.missingRequirementIds.length > 0
          ? 'evidence_missing'
          : validation.rejectedEvidenceArtifactIds.length > 0
            ? 'evidence_rejected'
            : 'evidence_expired';

      return {
        type,
        satisfied: validation.valid,
        missingRequirementIds: validation.missingRequirementIds,
        rejectedEvidenceArtifactIds: validation.rejectedEvidenceArtifactIds,
        expiredEvidenceArtifactIds: validation.expiredEvidenceArtifactIds,
        reasonCode: validation.reasonCode,
        reason: validation.reason,
        evidenceValidationId: validation.id,
        ...(validation.proofId !== undefined ? { evidenceProofId: validation.proofId } : {}),
      };
    },
  };
}
