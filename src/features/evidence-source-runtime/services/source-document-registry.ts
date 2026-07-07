import { createDigest } from '../domain/evidence-proof.js';
import type {
  SourceDocument,
  SourceDocumentAuthority,
  SourceDocumentLegalCompleteness,
  SourceDocumentType,
} from '../domain/source-document.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { SourceDocumentDuplicateIdError, SourceDocumentNotFoundError } from './evidence-runtime-errors.js';
import type { EvidenceLedger } from './evidence-ledger.js';
import type { EvidenceStore } from './evidence-store.js';

export interface RegisterSourceDocumentInput {
  readonly id: string;
  readonly type: SourceDocumentType;
  readonly title: string;
  readonly description?: string;
  readonly authority: SourceDocumentAuthority;
  readonly sourceUri?: string;
  readonly sourceSystem?: string;
  readonly sourceReference?: string;
  readonly contentHash?: string;
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
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UpdateSourceDocumentInput {
  readonly title?: string;
  readonly description?: string;
  readonly sourceUri?: string;
  readonly sourceReference?: string;
  readonly contentHash?: string;
  readonly effectiveUntil?: string;
  readonly reviewedByActorId?: string;
  readonly reviewedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const METADATA_FIELDS = [
  'type',
  'title',
  'description',
  'authority',
  'sourceUri',
  'sourceSystem',
  'sourceReference',
  'contentHash',
  'issuedAt',
  'effectiveFrom',
  'effectiveUntil',
  'trustDomainId',
  'customerId',
  'jurisdiction',
  'country',
  'domain',
  'demoOnly',
  'legalCompleteness',
  'metadata',
] as const;

function computeMetadataHash(document: Pick<SourceDocument, (typeof METADATA_FIELDS)[number]>): string {
  const projection: Record<string, unknown> = {};
  for (const field of METADATA_FIELDS) {
    projection[field] = document[field];
  }
  return createDigest(projection);
}

/**
 * Registers and maintains SourceDocuments -- metadata, hashes and a
 * reference only, never binary content. Every mutation is recorded to the
 * EvidenceLedger.
 */
export class SourceDocumentRegistry {
  constructor(
    private readonly ctx: EvidenceRuntimeContext,
    private readonly store: EvidenceStore,
    private readonly ledger: EvidenceLedger,
  ) {}

  register(input: RegisterSourceDocumentInput): SourceDocument {
    if (this.store.hasSourceDocument(input.id)) {
      throw new SourceDocumentDuplicateIdError(input.id);
    }

    const now = this.ctx.clock.now();
    const base: Pick<SourceDocument, (typeof METADATA_FIELDS)[number]> = {
      type: input.type,
      title: input.title,
      authority: input.authority,
      demoOnly: input.demoOnly,
      legalCompleteness: input.legalCompleteness,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sourceUri !== undefined ? { sourceUri: input.sourceUri } : {}),
      ...(input.sourceSystem !== undefined ? { sourceSystem: input.sourceSystem } : {}),
      ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {}),
      ...(input.contentHash !== undefined ? { contentHash: input.contentHash } : {}),
      ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt } : {}),
      ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
      ...(input.effectiveUntil !== undefined ? { effectiveUntil: input.effectiveUntil } : {}),
      ...(input.trustDomainId !== undefined ? { trustDomainId: input.trustDomainId } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    const document: SourceDocument = {
      id: input.id,
      status: 'active',
      metadataHash: computeMetadataHash(base),
      createdAt: now,
      updatedAt: now,
      ...base,
      ...(input.submittedByActorId !== undefined ? { submittedByActorId: input.submittedByActorId } : {}),
      ...(input.reviewedByActorId !== undefined ? { reviewedByActorId: input.reviewedByActorId } : {}),
      ...(input.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),
    };

    this.store.saveSourceDocument(document);
    this.ledger.recordEvent({
      type: 'source_document_registered',
      sourceDocumentId: document.id,
      ...(document.trustDomainId !== undefined ? { trustDomainId: document.trustDomainId } : {}),
      payload: { type: document.type, title: document.title, authority: document.authority, demoOnly: document.demoOnly },
    });
    return document;
  }

  update(id: string, input: UpdateSourceDocumentInput): SourceDocument {
    const existing = this.getOrThrow(id);
    const now = this.ctx.clock.now();
    const merged: Pick<SourceDocument, (typeof METADATA_FIELDS)[number]> = {
      type: existing.type,
      title: input.title ?? existing.title,
      authority: existing.authority,
      demoOnly: existing.demoOnly,
      legalCompleteness: existing.legalCompleteness,
      ...(input.description !== undefined ? { description: input.description } : existing.description !== undefined ? { description: existing.description } : {}),
      ...(input.sourceUri !== undefined ? { sourceUri: input.sourceUri } : existing.sourceUri !== undefined ? { sourceUri: existing.sourceUri } : {}),
      ...(existing.sourceSystem !== undefined ? { sourceSystem: existing.sourceSystem } : {}),
      ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : existing.sourceReference !== undefined ? { sourceReference: existing.sourceReference } : {}),
      ...(input.contentHash !== undefined ? { contentHash: input.contentHash } : existing.contentHash !== undefined ? { contentHash: existing.contentHash } : {}),
      ...(existing.issuedAt !== undefined ? { issuedAt: existing.issuedAt } : {}),
      ...(existing.effectiveFrom !== undefined ? { effectiveFrom: existing.effectiveFrom } : {}),
      ...(input.effectiveUntil !== undefined ? { effectiveUntil: input.effectiveUntil } : existing.effectiveUntil !== undefined ? { effectiveUntil: existing.effectiveUntil } : {}),
      ...(existing.trustDomainId !== undefined ? { trustDomainId: existing.trustDomainId } : {}),
      ...(existing.customerId !== undefined ? { customerId: existing.customerId } : {}),
      ...(existing.jurisdiction !== undefined ? { jurisdiction: existing.jurisdiction } : {}),
      ...(existing.country !== undefined ? { country: existing.country } : {}),
      ...(existing.domain !== undefined ? { domain: existing.domain } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : existing.metadata !== undefined ? { metadata: existing.metadata } : {}),
    };

    const updated: SourceDocument = {
      ...existing,
      ...merged,
      metadataHash: computeMetadataHash(merged),
      updatedAt: now,
      ...(input.reviewedByActorId !== undefined ? { reviewedByActorId: input.reviewedByActorId } : {}),
      ...(input.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),
    };

    this.store.saveSourceDocument(updated);
    this.ledger.recordEvent({
      type: 'source_document_updated',
      sourceDocumentId: updated.id,
      ...(updated.trustDomainId !== undefined ? { trustDomainId: updated.trustDomainId } : {}),
      payload: { metadataHash: updated.metadataHash },
    });
    return updated;
  }

  revoke(id: string, reasonCode: string, reason: string): SourceDocument {
    const existing = this.getOrThrow(id);
    const now = this.ctx.clock.now();
    const updated = this.store.updateSourceDocumentStatus(id, 'revoked', now);
    if (!updated) {
      throw new SourceDocumentNotFoundError(id);
    }
    this.ledger.recordEvent({
      type: 'source_document_revoked',
      sourceDocumentId: id,
      ...(existing.trustDomainId !== undefined ? { trustDomainId: existing.trustDomainId } : {}),
      payload: { reasonCode, reason },
    });
    return updated;
  }

  supersede(id: string, supersededBySourceDocumentId: string): SourceDocument {
    this.getOrThrow(id);
    const now = this.ctx.clock.now();
    const updated = this.store.updateSourceDocumentStatus(id, 'superseded', now);
    if (!updated) {
      throw new SourceDocumentNotFoundError(id);
    }
    this.ledger.recordEvent({
      type: 'source_document_updated',
      sourceDocumentId: id,
      ...(updated.trustDomainId !== undefined ? { trustDomainId: updated.trustDomainId } : {}),
      payload: { status: 'superseded', supersededBySourceDocumentId },
    });
    return updated;
  }

  markExpired(id: string): SourceDocument {
    this.getOrThrow(id);
    const now = this.ctx.clock.now();
    const updated = this.store.updateSourceDocumentStatus(id, 'expired', now);
    if (!updated) {
      throw new SourceDocumentNotFoundError(id);
    }
    this.ledger.recordEvent({
      type: 'source_document_updated',
      sourceDocumentId: id,
      ...(updated.trustDomainId !== undefined ? { trustDomainId: updated.trustDomainId } : {}),
      payload: { status: 'expired' },
    });
    return updated;
  }

  get(id: string): SourceDocument | undefined {
    return this.store.getSourceDocument(id);
  }

  private getOrThrow(id: string): SourceDocument {
    const existing = this.store.getSourceDocument(id);
    if (!existing) {
      throw new SourceDocumentNotFoundError(id);
    }
    return existing;
  }
}
