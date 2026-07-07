export type EvidenceArtifactType =
  | 'contract'
  | 'purchase_order'
  | 'invoice'
  | 'event_record'
  | 'approval_memo'
  | 'authority_proof'
  | 'identity_proof'
  | 'customer_policy'
  | 'data_classification'
  | 'risk_assessment'
  | 'human_comment'
  | 'system_log'
  | 'external_reference'
  | 'external_attestation'
  | 'manual_note'
  | 'other';

export type EvidenceArtifactStatus =
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'needs_review'
  | 'superseded'
  | 'revoked'
  | 'expired';

/**
 * A specific evidence item presented to satisfy a requirement or support a
 * decision. May reference a SourceDocument, but never carries the source's
 * binary content -- only metadata, hashes and a reference.
 */
export interface EvidenceArtifact {
  readonly id: string;
  readonly type: EvidenceArtifactType;
  readonly title: string;
  readonly description?: string;
  readonly status: EvidenceArtifactStatus;
  readonly sourceDocumentId?: string;
  readonly trustDomainId: string;
  readonly submittedByActorId: string;
  readonly submittedAt: string;
  readonly reviewedByActorId?: string;
  readonly reviewedAt?: string;
  readonly reviewId?: string;
  readonly contentHash?: string;
  readonly metadataHash: string;
  readonly sourceUri?: string;
  readonly sourceReference?: string;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly tags: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
