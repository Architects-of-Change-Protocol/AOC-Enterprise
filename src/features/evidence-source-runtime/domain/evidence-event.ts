import type { CitationTargetType } from './citation.js';

export type EvidenceEventType =
  | 'source_document_registered'
  | 'source_document_updated'
  | 'source_document_revoked'
  | 'evidence_artifact_submitted'
  | 'evidence_artifact_accepted'
  | 'evidence_artifact_rejected'
  | 'evidence_requirement_created'
  | 'evidence_requirement_satisfied'
  | 'evidence_requirement_rejected'
  | 'evidence_review_recorded'
  | 'citation_created'
  | 'evidence_link_created'
  | 'evidence_proof_created'
  | 'evidence_export_created';

export interface EvidenceEvent {
  readonly id: string;
  readonly type: EvidenceEventType;
  readonly trustDomainId?: string;
  readonly sourceDocumentId?: string;
  readonly evidenceArtifactId?: string;
  readonly requirementId?: string;
  readonly satisfactionId?: string;
  readonly reviewId?: string;
  readonly citationId?: string;
  readonly evidenceLinkId?: string;
  readonly proofId?: string;
  readonly targetType?: CitationTargetType;
  readonly targetId?: string;
  readonly timestamp: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly previousHash?: string;
  readonly eventHash: string;
}
