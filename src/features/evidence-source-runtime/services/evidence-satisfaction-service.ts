import type { EvidenceSatisfaction, EvidenceSatisfactionStatus } from '../domain/evidence-satisfaction.js';
import type { CitationTargetType } from '../domain/citation.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceArtifactNotFoundError, EvidenceRequirementNotFoundError, EvidenceSatisfactionInvalidError } from './evidence-runtime-errors.js';
import type { EvidenceLedger } from './evidence-ledger.js';
import type { EvidenceStore } from './evidence-store.js';
import type { EvidenceRequirementService } from './evidence-requirement-service.js';
import type { EvidenceLinkService } from './evidence-link-service.js';
import type { EvidenceProofService } from './evidence-proof-service.js';

export interface SatisfyEvidenceRequirementInput {
  readonly requirementId: string;
  readonly evidenceArtifactIds: readonly string[];
  readonly satisfiedByActorId?: string;
  readonly reviewedByActorId?: string;
  readonly reasonCode: string;
  readonly reason: string;
  /** Caller declares the submission is intentionally partial (e.g. only some of several required documents arrived). Ignored when any referenced artifact is rejected/revoked/expired -- that always yields a `rejected` satisfaction. */
  readonly partial?: boolean;
  readonly createProof?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function deriveTarget(requirement: { policyDecisionId?: string; approvalRequestId?: string; recognitionDecisionId?: string; enforcementDecisionId?: string }): { targetType: CitationTargetType; targetId: string } | undefined {
  if (requirement.policyDecisionId !== undefined) {
    return { targetType: 'policy_decision', targetId: requirement.policyDecisionId };
  }
  if (requirement.approvalRequestId !== undefined) {
    return { targetType: 'approval_request', targetId: requirement.approvalRequestId };
  }
  if (requirement.recognitionDecisionId !== undefined) {
    return { targetType: 'recognition_decision', targetId: requirement.recognitionDecisionId };
  }
  if (requirement.enforcementDecisionId !== undefined) {
    return { targetType: 'enforcement_decision', targetId: requirement.enforcementDecisionId };
  }
  return undefined;
}

/**
 * Links EvidenceArtifacts to the one EvidenceRequirement they support and
 * decides -- purely from artifact status -- whether that closes the
 * requirement out. This service never inspects evidence content and never
 * infers legal sufficiency; `reasonCode`/`reason` are always supplied by the
 * caller.
 */
export class EvidenceSatisfactionService {
  constructor(
    private readonly ctx: EvidenceRuntimeContext,
    private readonly store: EvidenceStore,
    private readonly ledger: EvidenceLedger,
    private readonly requirementService: EvidenceRequirementService,
    private readonly linkService: EvidenceLinkService,
    private readonly proofService: EvidenceProofService,
  ) {}

  satisfy(input: SatisfyEvidenceRequirementInput): EvidenceSatisfaction {
    if (input.evidenceArtifactIds.length === 0) {
      throw new EvidenceSatisfactionInvalidError('at least one evidence artifact id is required');
    }

    const requirement = this.store.getRequirement(input.requirementId);
    if (!requirement) {
      throw new EvidenceRequirementNotFoundError(input.requirementId);
    }

    const artifacts = input.evidenceArtifactIds.map((id) => {
      const artifact = this.store.getEvidenceArtifact(id);
      if (!artifact) {
        throw new EvidenceArtifactNotFoundError(id);
      }
      return artifact;
    });

    const invalidArtifactIds = artifacts.filter((artifact) => artifact.status === 'rejected' || artifact.status === 'revoked' || artifact.status === 'expired').map((artifact) => artifact.id);

    let status: EvidenceSatisfactionStatus;
    if (invalidArtifactIds.length > 0) {
      status = 'rejected';
    } else if (input.partial === true) {
      status = 'partially_satisfied';
    } else {
      status = 'satisfied';
    }

    const now = this.ctx.clock.now();
    const satisfaction: EvidenceSatisfaction = {
      id: this.ctx.ids.nextId('evidence-satisfaction'),
      requirementId: input.requirementId,
      evidenceArtifactIds: input.evidenceArtifactIds,
      status,
      satisfiedAt: now,
      reasonCode: input.reasonCode,
      reason: input.reason,
      ...(input.satisfiedByActorId !== undefined ? { satisfiedByActorId: input.satisfiedByActorId } : {}),
      ...(input.reviewedByActorId !== undefined ? { reviewedByActorId: input.reviewedByActorId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    this.store.saveSatisfaction(satisfaction);

    const target = deriveTarget(requirement);
    const linkIds: string[] = [];
    if (target) {
      for (const artifact of artifacts) {
        const link = this.linkService.createLink({
          type: status === 'rejected' ? 'rejects' : 'satisfies',
          evidenceArtifactId: artifact.id,
          targetType: target.targetType,
          targetId: target.targetId,
          requirementId: input.requirementId,
          satisfactionId: satisfaction.id,
          ...(input.satisfiedByActorId !== undefined ? { createdByActorId: input.satisfiedByActorId } : {}),
        });
        linkIds.push(link.id);
      }
    }

    if (status === 'satisfied') {
      this.requirementService.markSatisfied(input.requirementId);
    } else if (status === 'partially_satisfied') {
      this.requirementService.markPartiallySatisfied(input.requirementId);
    }

    let finalSatisfaction = satisfaction;
    if (input.createProof === true) {
      const proof = this.proofService.createProof({
        trustDomainId: requirement.trustDomainId,
        evidenceArtifactIds: artifacts.map((artifact) => artifact.id),
        requirementIds: [input.requirementId],
        satisfactionIds: [satisfaction.id],
        evidenceLinkIds: linkIds,
        ...(target !== undefined ? target : {}),
      });
      finalSatisfaction = { ...satisfaction, proofId: proof.id };
      this.store.saveSatisfaction(finalSatisfaction);
    }

    this.ledger.recordEvent({
      type: status === 'rejected' ? 'evidence_requirement_rejected' : 'evidence_requirement_satisfied',
      requirementId: input.requirementId,
      satisfactionId: satisfaction.id,
      trustDomainId: requirement.trustDomainId,
      payload: { status, evidenceArtifactIds: input.evidenceArtifactIds, invalidArtifactIds },
    });

    return finalSatisfaction;
  }

  get(id: string): EvidenceSatisfaction | undefined {
    return this.store.getSatisfaction(id);
  }

  listByRequirement(requirementId: string): readonly EvidenceSatisfaction[] {
    return this.store.listSatisfactionsByRequirement(requirementId);
  }
}
