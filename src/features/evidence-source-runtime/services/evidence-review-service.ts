import type { EvidenceReview, EvidenceReviewDecision } from '../domain/evidence-review.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import type { EvidenceLedger } from './evidence-ledger.js';
import type { EvidenceStore } from './evidence-store.js';
import type { EvidenceArtifactRegistry } from './evidence-artifact-registry.js';
import type { EvidenceRequirementService } from './evidence-requirement-service.js';

export interface RecordEvidenceReviewInput {
  readonly evidenceArtifactId?: string;
  readonly requirementId?: string;
  readonly satisfactionId?: string;
  readonly reviewerActorId: string;
  readonly decision: EvidenceReviewDecision;
  readonly reasonCode: string;
  readonly reason: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Records human/system review of an evidence artifact, requirement or
 * satisfaction, and applies the review's status effect on the artifact
 * registry. A review decision is a record of what the reviewer decided; it
 * is never treated as a legal-sufficiency conclusion unless the caller's
 * own metadata (e.g. `reviewedByCounsel: true`) says so explicitly.
 */
export class EvidenceReviewService {
  constructor(
    private readonly ctx: EvidenceRuntimeContext,
    private readonly store: EvidenceStore,
    private readonly ledger: EvidenceLedger,
    private readonly artifactRegistry: EvidenceArtifactRegistry,
    private readonly requirementService: EvidenceRequirementService,
  ) {}

  recordReview(input: RecordEvidenceReviewInput): EvidenceReview {
    const review: EvidenceReview = {
      id: this.ctx.ids.nextId('evidence-review'),
      reviewerActorId: input.reviewerActorId,
      decision: input.decision,
      reasonCode: input.reasonCode,
      reason: input.reason,
      reviewedAt: this.ctx.clock.now(),
      ...(input.evidenceArtifactId !== undefined ? { evidenceArtifactId: input.evidenceArtifactId } : {}),
      ...(input.requirementId !== undefined ? { requirementId: input.requirementId } : {}),
      ...(input.satisfactionId !== undefined ? { satisfactionId: input.satisfactionId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    this.store.saveReview(review);

    if (input.evidenceArtifactId !== undefined) {
      this.applyArtifactEffect(input.evidenceArtifactId, input.reviewerActorId, input.decision, input.reasonCode, input.reason, review.id);
    }
    if (input.requirementId !== undefined && input.decision === 'waived') {
      this.requirementService.markWaived(input.requirementId, input.reasonCode, input.reason);
    }

    this.ledger.recordEvent({
      type: 'evidence_review_recorded',
      reviewId: review.id,
      ...(input.evidenceArtifactId !== undefined ? { evidenceArtifactId: input.evidenceArtifactId } : {}),
      ...(input.requirementId !== undefined ? { requirementId: input.requirementId } : {}),
      ...(input.satisfactionId !== undefined ? { satisfactionId: input.satisfactionId } : {}),
      payload: { decision: input.decision, reasonCode: input.reasonCode },
    });

    return review;
  }

  private applyArtifactEffect(
    evidenceArtifactId: string,
    reviewerActorId: string,
    decision: EvidenceReviewDecision,
    reasonCode: string,
    reason: string,
    reviewId: string,
  ): void {
    switch (decision) {
      case 'accepted':
        this.artifactRegistry.accept(evidenceArtifactId, reviewerActorId, reviewId);
        return;
      case 'rejected':
        this.artifactRegistry.reject(evidenceArtifactId, reviewerActorId, reasonCode, reason, reviewId);
        return;
      case 'needs_more_evidence':
        this.artifactRegistry.markNeedsReview(evidenceArtifactId);
        return;
      case 'waived':
      case 'not_applicable':
        return;
    }
  }

  get(id: string): EvidenceReview | undefined {
    return this.store.getReview(id);
  }

  listByArtifact(evidenceArtifactId: string): readonly EvidenceReview[] {
    return this.store.listReviewsByArtifact(evidenceArtifactId);
  }
}
