import type { EvidenceRequirement } from '../domain/evidence-requirement.js';
import type { Citation } from '../domain/citation.js';
import type { EvidenceLink } from '../domain/evidence-link.js';
import type { EvidenceProof } from '../domain/evidence-proof.js';
import type { EvidenceRuntime } from '../services/evidence-runtime.js';

export type ApprovalCitationTargetType = 'approval_request' | 'approval_decision' | 'approval_proof';

/**
 * Structural mirror of Approval Runtime's ApprovalEvidenceRequirement array
 * (src/features/approval-runtime/domain/approval-evidence.ts /
 * approval-requirement.ts). This module never imports those types directly.
 */
export interface ApprovalEvidenceRequirementInput {
  readonly trustDomainId: string;
  readonly approvalRequestId: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly resourceScope?: string;
  readonly requirements: ReadonlyArray<{
    readonly id: string;
    readonly type: string;
    readonly description: string;
    readonly required: boolean;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }>;
}

export interface LinkApprovalReviewedEvidenceInput {
  readonly approvalDecisionId: string;
  readonly approverActorId: string;
  readonly evidenceArtifactIds: readonly string[];
}

export interface CreateApprovalCitationInput {
  readonly sourceDocumentId?: string;
  readonly evidenceArtifactId?: string;
  readonly targetType: ApprovalCitationTargetType;
  readonly targetId: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly createdByActorId?: string;
}

export interface CreateApprovalEvidenceProofInput {
  readonly trustDomainId: string;
  readonly approvalDecisionId: string;
  readonly evidenceArtifactIds: readonly string[];
  readonly requirementIds?: readonly string[];
}

export interface ApprovalEvidenceIntegration {
  /** Idempotently maps each ApprovalEvidenceRequirement onto an EvidenceRequirement. */
  createRequirementsForApprovalRequest(input: ApprovalEvidenceRequirementInput): readonly EvidenceRequirement[];
  /**
   * Records that the listed evidence artifacts were associated with an
   * approval decision the approver actually made. This never fabricates the
   * approver's review -- it links evidence to the decision the host already
   * recorded in Approval Runtime; recording that the approver *accepted* a
   * given artifact still requires an explicit EvidenceReview via
   * `runtime.reviewEvidence`.
   */
  linkReviewedEvidence(input: LinkApprovalReviewedEvidenceInput): readonly EvidenceLink[];
  createCitationForApprovalTarget(input: CreateApprovalCitationInput): Citation;
  createProofForApprovalDecision(input: CreateApprovalEvidenceProofInput): EvidenceProof;
}

/**
 * Structural adapter Approval Runtime (or a host composing both runtimes)
 * can use to attach evidence to an approval request/decision/proof. This
 * integration never decides an approval outcome and never invents an
 * approver's review -- Approval Runtime remains the sole source of truth
 * for who approved what and why.
 */
export function createApprovalEvidenceIntegration(runtime: EvidenceRuntime): ApprovalEvidenceIntegration {
  return {
    createRequirementsForApprovalRequest(input: ApprovalEvidenceRequirementInput): readonly EvidenceRequirement[] {
      return input.requirements.map((requirement) => {
        const existing = runtime.store
          .listRequirementsBySource('approval')
          .find((candidate) => candidate.sourceRequirementId === requirement.id && candidate.approvalRequestId === input.approvalRequestId);
        if (existing) {
          return existing;
        }

        return runtime.requirements.fromApprovalRequirement({
          trustDomainId: input.trustDomainId,
          approvalRequestId: input.approvalRequestId,
          requirement: {
            id: requirement.id,
            type: 'other',
            description: requirement.description,
            required: requirement.required,
            ...(requirement.metadata !== undefined ? { metadata: requirement.metadata } : {}),
          },
          ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
          ...(input.action !== undefined ? { action: input.action } : {}),
          ...(input.resourceScope !== undefined ? { resourceScope: input.resourceScope } : {}),
        });
      });
    },

    linkReviewedEvidence(input: LinkApprovalReviewedEvidenceInput): readonly EvidenceLink[] {
      return input.evidenceArtifactIds.map((evidenceArtifactId) =>
        runtime.linkEvidence({
          type: 'reviewed_for',
          evidenceArtifactId,
          targetType: 'approval_decision',
          targetId: input.approvalDecisionId,
          createdByActorId: input.approverActorId,
        }),
      );
    },

    createCitationForApprovalTarget(input: CreateApprovalCitationInput): Citation {
      return runtime.createCitation({
        targetType: input.targetType,
        targetId: input.targetId,
        reasonCode: input.reasonCode,
        reason: input.reason,
        ...(input.sourceDocumentId !== undefined ? { sourceDocumentId: input.sourceDocumentId } : {}),
        ...(input.evidenceArtifactId !== undefined ? { evidenceArtifactId: input.evidenceArtifactId } : {}),
        ...(input.createdByActorId !== undefined ? { createdByActorId: input.createdByActorId } : {}),
      });
    },

    createProofForApprovalDecision(input: CreateApprovalEvidenceProofInput): EvidenceProof {
      return runtime.createEvidenceProof({
        trustDomainId: input.trustDomainId,
        targetType: 'approval_decision',
        targetId: input.approvalDecisionId,
        evidenceArtifactIds: input.evidenceArtifactIds,
        ...(input.requirementIds !== undefined ? { requirementIds: input.requirementIds } : {}),
      });
    },
  };
}
