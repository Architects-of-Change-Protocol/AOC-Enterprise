import type { EvidenceRequirement } from '../domain/evidence-requirement.js';
import type { Citation } from '../domain/citation.js';
import type { EvidenceLink } from '../domain/evidence-link.js';
import type { EvidenceProof } from '../domain/evidence-proof.js';
import type { EvidenceRuntime } from '../services/evidence-runtime.js';
import { EvidenceRuntimeError } from '../services/evidence-runtime-errors.js';

/**
 * Structural mirror of Recognition Runtime's RecognitionDecision.requiredEvidence
 * (src/features/recognition-runtime/domain/recognition-decision.ts), which
 * is a plain array of evidence descriptions -- Recognition Runtime has no
 * typed evidence-requirement shape of its own. This module never imports
 * RecognitionDecision directly.
 */
export interface RecognitionEvidenceRequirementInput {
  readonly trustDomainId: string;
  readonly recognitionDecisionId: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly requiredEvidence: readonly string[];
}

export interface LinkRecognitionEvidenceInput {
  readonly recognitionDecisionId: string;
  readonly evidenceArtifactIds: readonly string[];
  readonly createdByActorId?: string;
}

export interface CreateRecognitionCitationInput {
  readonly sourceDocumentId?: string;
  readonly evidenceArtifactId?: string;
  readonly recognitionDecisionId: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly createdByActorId?: string;
}

export interface CreateRecognitionEvidenceProofInput {
  readonly trustDomainId: string;
  readonly recognitionDecisionId: string;
  readonly evidenceArtifactIds: readonly string[];
  readonly requirementIds?: readonly string[];
}

export interface RecognitionEvidenceIntegration {
  /** Idempotently maps each requiredEvidence description onto an EvidenceRequirement. */
  createRequirementsFromRecognitionDecision(input: RecognitionEvidenceRequirementInput): readonly EvidenceRequirement[];
  linkEvidenceToRecognitionDecision(input: LinkRecognitionEvidenceInput): readonly EvidenceLink[];
  createCitationForRecognitionDecision(input: CreateRecognitionCitationInput): Citation;
  /** Only creates a proof once every referenced evidence artifact is `accepted` -- throws otherwise, since a proof must never assert evidence exists that was not actually accepted. */
  createProofForRecognitionDecision(input: CreateRecognitionEvidenceProofInput): EvidenceProof;
}

/**
 * Structural adapter Recognition Runtime (or a host composing both
 * runtimes) can use to represent a `require_more_evidence` decision's
 * evidence needs inside the Evidence / Source / Citation Runtime, and to
 * attach evidence to that decision. This integration never overrides or
 * re-derives a RecognitionDecision -- Recognition Runtime remains the sole
 * source of truth for recognition outcomes.
 */
export function createRecognitionEvidenceIntegration(runtime: EvidenceRuntime): RecognitionEvidenceIntegration {
  return {
    createRequirementsFromRecognitionDecision(input: RecognitionEvidenceRequirementInput): readonly EvidenceRequirement[] {
      return input.requiredEvidence.map((description, index) => {
        const existing = runtime.store
          .listRequirementsBySource('recognition')
          .find((candidate) => candidate.recognitionDecisionId === input.recognitionDecisionId && candidate.description === description);
        if (existing) {
          return existing;
        }

        return runtime.requirements.fromRecognitionRequirement({
          trustDomainId: input.trustDomainId,
          recognitionDecisionId: input.recognitionDecisionId,
          requirement: {
            id: `${input.recognitionDecisionId}-evidence-${index}`,
            type: 'other',
            description,
            required: true,
          },
          ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
          ...(input.action !== undefined ? { action: input.action } : {}),
        });
      });
    },

    linkEvidenceToRecognitionDecision(input: LinkRecognitionEvidenceInput): readonly EvidenceLink[] {
      return input.evidenceArtifactIds.map((evidenceArtifactId) =>
        runtime.linkEvidence({
          type: 'supports',
          evidenceArtifactId,
          targetType: 'recognition_decision',
          targetId: input.recognitionDecisionId,
          ...(input.createdByActorId !== undefined ? { createdByActorId: input.createdByActorId } : {}),
        }),
      );
    },

    createCitationForRecognitionDecision(input: CreateRecognitionCitationInput): Citation {
      return runtime.createCitation({
        targetType: 'recognition_decision',
        targetId: input.recognitionDecisionId,
        reasonCode: input.reasonCode,
        reason: input.reason,
        ...(input.sourceDocumentId !== undefined ? { sourceDocumentId: input.sourceDocumentId } : {}),
        ...(input.evidenceArtifactId !== undefined ? { evidenceArtifactId: input.evidenceArtifactId } : {}),
        ...(input.createdByActorId !== undefined ? { createdByActorId: input.createdByActorId } : {}),
      });
    },

    createProofForRecognitionDecision(input: CreateRecognitionEvidenceProofInput): EvidenceProof {
      const notAccepted = input.evidenceArtifactIds.filter((id) => runtime.evidenceArtifacts.get(id)?.status !== 'accepted');
      if (notAccepted.length > 0) {
        throw new EvidenceRuntimeError(`Cannot create recognition evidence proof: evidence artifacts not accepted: ${notAccepted.join(', ')}`);
      }
      return runtime.createEvidenceProof({
        trustDomainId: input.trustDomainId,
        targetType: 'recognition_decision',
        targetId: input.recognitionDecisionId,
        evidenceArtifactIds: input.evidenceArtifactIds,
        ...(input.requirementIds !== undefined ? { requirementIds: input.requirementIds } : {}),
      });
    },
  };
}
