export type SourceDocumentType =
  | 'contract'
  | 'purchase_order'
  | 'invoice'
  | 'event_record'
  | 'approval_memo'
  | 'customer_policy'
  | 'data_classification'
  | 'risk_assessment'
  | 'authority_memo'
  | 'system_log'
  | 'external_attestation'
  | 'manual_note'
  | 'other';

export type SourceDocumentStatus = 'draft' | 'active' | 'superseded' | 'revoked' | 'expired' | 'archived';

export type SourceDocumentAuthority =
  | 'demo_only'
  | 'customer_provided'
  | 'internal'
  | 'partner_provided'
  | 'external_reference'
  | 'counsel_reviewed';

/**
 * Legal-completeness is a label the caller asserts, never a conclusion this
 * runtime derives. `verified_by_counsel`/`verified_by_customer` must only be
 * set when the caller has independent, out-of-band confirmation of that
 * fact -- this runtime never inspects document contents, so it cannot itself
 * promote a document from `not_legal_advice` to a verified state.
 */
export type SourceDocumentLegalCompleteness =
  | 'not_legal_advice'
  | 'partial_policy_model'
  | 'customer_provided'
  | 'verified_by_customer'
  | 'verified_by_counsel';

/**
 * A SourceDocument records where evidence comes from -- metadata, hashes and
 * a reference, never binary content. Registering a SourceDocument is not a
 * claim that its content is legally sufficient; see `legalCompleteness`.
 */
export interface SourceDocument {
  readonly id: string;
  readonly type: SourceDocumentType;
  readonly title: string;
  readonly description?: string;
  readonly status: SourceDocumentStatus;
  readonly authority: SourceDocumentAuthority;
  readonly sourceUri?: string;
  readonly sourceSystem?: string;
  readonly sourceReference?: string;
  readonly contentHash?: string;
  readonly metadataHash: string;
  readonly issuedAt?: string;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly submittedByActorId?: string;
  readonly reviewedByActorId?: string;
  readonly reviewedAt?: string;
  readonly trustDomainId?: string;
  readonly customerId?: string;
  readonly jurisdiction?: string;
  readonly country?: string;
  readonly domain?: string;
  readonly demoOnly: boolean;
  readonly legalCompleteness: SourceDocumentLegalCompleteness;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
