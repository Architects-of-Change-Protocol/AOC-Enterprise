export type EvidenceReviewDecision = 'accepted' | 'rejected' | 'needs_more_evidence' | 'waived' | 'not_applicable';

/**
 * Records a human or system review of an evidence artifact or evidence
 * satisfaction. A review decision is never read as a legal-sufficiency
 * conclusion -- it records what the reviewer decided, not what the law
 * requires.
 */
export interface EvidenceReview {
  readonly id: string;
  readonly evidenceArtifactId?: string;
  readonly requirementId?: string;
  readonly satisfactionId?: string;
  readonly reviewerActorId: string;
  readonly decision: EvidenceReviewDecision;
  readonly reasonCode: string;
  readonly reason: string;
  readonly reviewedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
