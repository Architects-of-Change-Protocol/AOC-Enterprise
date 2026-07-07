import { createDigest } from '../domain/evidence-proof.js';
import type { EvidenceArtifact, EvidenceArtifactType } from '../domain/evidence-artifact.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import {
  EvidenceArtifactDuplicateIdError,
  EvidenceArtifactNotFoundError,
  SourceDocumentNotFoundError,
} from './evidence-runtime-errors.js';
import type { EvidenceLedger } from './evidence-ledger.js';
import type { EvidenceStore } from './evidence-store.js';

export interface SubmitEvidenceArtifactInput {
  readonly id: string;
  readonly type: EvidenceArtifactType;
  readonly title: string;
  readonly description?: string;
  readonly sourceDocumentId?: string;
  readonly trustDomainId: string;
  readonly submittedByActorId: string;
  readonly contentHash?: string;
  readonly sourceUri?: string;
  readonly sourceReference?: string;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const METADATA_FIELDS = [
  'type',
  'title',
  'description',
  'sourceDocumentId',
  'trustDomainId',
  'contentHash',
  'sourceUri',
  'sourceReference',
  'effectiveFrom',
  'effectiveUntil',
  'tags',
  'metadata',
] as const;

function computeMetadataHash(artifact: Pick<EvidenceArtifact, (typeof METADATA_FIELDS)[number]>): string {
  const projection: Record<string, unknown> = {};
  for (const field of METADATA_FIELDS) {
    projection[field] = artifact[field];
  }
  return createDigest(projection);
}

/**
 * Submits and maintains EvidenceArtifacts. An artifact submitted with a
 * `sourceDocumentId` must reference a SourceDocument this runtime actually
 * registered -- this registry never fabricates a source link.
 */
export class EvidenceArtifactRegistry {
  constructor(
    private readonly ctx: EvidenceRuntimeContext,
    private readonly store: EvidenceStore,
    private readonly ledger: EvidenceLedger,
  ) {}

  submit(input: SubmitEvidenceArtifactInput): EvidenceArtifact {
    if (this.store.hasEvidenceArtifact(input.id)) {
      throw new EvidenceArtifactDuplicateIdError(input.id);
    }
    if (input.sourceDocumentId !== undefined && !this.store.hasSourceDocument(input.sourceDocumentId)) {
      throw new SourceDocumentNotFoundError(input.sourceDocumentId);
    }

    const now = this.ctx.clock.now();
    const base: Pick<EvidenceArtifact, (typeof METADATA_FIELDS)[number]> = {
      type: input.type,
      title: input.title,
      trustDomainId: input.trustDomainId,
      tags: input.tags ?? [],
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sourceDocumentId !== undefined ? { sourceDocumentId: input.sourceDocumentId } : {}),
      ...(input.contentHash !== undefined ? { contentHash: input.contentHash } : {}),
      ...(input.sourceUri !== undefined ? { sourceUri: input.sourceUri } : {}),
      ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {}),
      ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
      ...(input.effectiveUntil !== undefined ? { effectiveUntil: input.effectiveUntil } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    const artifact: EvidenceArtifact = {
      id: input.id,
      status: 'submitted',
      submittedByActorId: input.submittedByActorId,
      submittedAt: now,
      metadataHash: computeMetadataHash(base),
      ...base,
    };

    this.store.saveEvidenceArtifact(artifact);
    this.ledger.recordEvent({
      type: 'evidence_artifact_submitted',
      evidenceArtifactId: artifact.id,
      trustDomainId: artifact.trustDomainId,
      payload: { type: artifact.type, title: artifact.title },
    });
    return artifact;
  }

  accept(id: string, reviewedByActorId: string, reviewId?: string): EvidenceArtifact {
    const existing = this.getOrThrow(id);
    const now = this.ctx.clock.now();
    const updated: EvidenceArtifact = {
      ...existing,
      status: 'accepted',
      reviewedByActorId,
      reviewedAt: now,
      ...(reviewId !== undefined ? { reviewId } : {}),
    };
    this.store.saveEvidenceArtifact(updated);
    this.ledger.recordEvent({
      type: 'evidence_artifact_accepted',
      evidenceArtifactId: id,
      trustDomainId: existing.trustDomainId,
      payload: { reviewedByActorId },
    });
    return updated;
  }

  reject(id: string, reviewedByActorId: string, reasonCode: string, reason: string, reviewId?: string): EvidenceArtifact {
    const existing = this.getOrThrow(id);
    const now = this.ctx.clock.now();
    const updated: EvidenceArtifact = {
      ...existing,
      status: 'rejected',
      reviewedByActorId,
      reviewedAt: now,
      ...(reviewId !== undefined ? { reviewId } : {}),
    };
    this.store.saveEvidenceArtifact(updated);
    this.ledger.recordEvent({
      type: 'evidence_artifact_rejected',
      evidenceArtifactId: id,
      trustDomainId: existing.trustDomainId,
      payload: { reviewedByActorId, reasonCode, reason },
    });
    return updated;
  }

  revoke(id: string): EvidenceArtifact {
    return this.setStatus(id, 'revoked');
  }

  supersede(id: string, supersededByEvidenceArtifactId: string): EvidenceArtifact {
    const updated = this.setStatus(id, 'superseded');
    this.ledger.recordEvent({
      type: 'evidence_artifact_submitted',
      evidenceArtifactId: id,
      trustDomainId: updated.trustDomainId,
      payload: { status: 'superseded', supersededByEvidenceArtifactId },
    });
    return updated;
  }

  markExpired(id: string): EvidenceArtifact {
    return this.setStatus(id, 'expired');
  }

  markNeedsReview(id: string): EvidenceArtifact {
    return this.setStatus(id, 'needs_review');
  }

  get(id: string): EvidenceArtifact | undefined {
    return this.store.getEvidenceArtifact(id);
  }

  private setStatus(id: string, status: EvidenceArtifact['status']): EvidenceArtifact {
    this.getOrThrow(id);
    const updated = this.store.updateEvidenceArtifactStatus(id, status);
    if (!updated) {
      throw new EvidenceArtifactNotFoundError(id);
    }
    return updated;
  }

  private getOrThrow(id: string): EvidenceArtifact {
    const existing = this.store.getEvidenceArtifact(id);
    if (!existing) {
      throw new EvidenceArtifactNotFoundError(id);
    }
    return existing;
  }
}
