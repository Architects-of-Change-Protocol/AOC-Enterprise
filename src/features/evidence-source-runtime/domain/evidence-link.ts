import type { CitationTargetType } from './citation.js';

export type EvidenceLinkType = 'supports' | 'satisfies' | 'reviewed_for' | 'referenced_by' | 'supersedes' | 'rejects' | 'waives';

/** Connects an evidence artifact to a runtime entity without asserting a citation narrative. */
export interface EvidenceLink {
  readonly id: string;
  readonly type: EvidenceLinkType;
  readonly evidenceArtifactId: string;
  readonly targetType: CitationTargetType;
  readonly targetId: string;
  readonly requirementId?: string;
  readonly satisfactionId?: string;
  readonly createdAt: string;
  readonly createdByActorId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
