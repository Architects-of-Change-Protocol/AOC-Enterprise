export type EvidenceSatisfactionStatus = 'satisfied' | 'partially_satisfied' | 'rejected' | 'needs_review' | 'superseded';

/** Links one or more EvidenceArtifacts to the one EvidenceRequirement they support. */
export interface EvidenceSatisfaction {
  readonly id: string;
  readonly requirementId: string;
  readonly evidenceArtifactIds: readonly string[];
  readonly status: EvidenceSatisfactionStatus;
  readonly satisfiedByActorId?: string;
  readonly reviewedByActorId?: string;
  readonly satisfiedAt: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly proofId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
