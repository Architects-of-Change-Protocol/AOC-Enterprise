import { createDigest } from '../domain/evidence-proof.js';
import type { EvidenceEvent, EvidenceEventType } from '../domain/evidence-event.js';
import type { CitationTargetType } from '../domain/citation.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import type { EvidenceStore } from './evidence-store.js';

export interface RecordEvidenceEventInput {
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
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EvidenceEventFilter {
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
}

/**
 * Records deterministic, hash-chained EvidenceEvents. This service owns the
 * hashing rule, EvidenceStore owns persistence and querying.
 */
export class EvidenceLedger {
  constructor(
    private readonly ctx: EvidenceRuntimeContext,
    private readonly store: EvidenceStore,
  ) {}

  recordEvent(input: RecordEvidenceEventInput): EvidenceEvent {
    const timestamp = this.ctx.clock.now();
    const previousHash = this.store.getLatestEvent()?.eventHash;
    const eventHash = createDigest({
      type: input.type,
      trustDomainId: input.trustDomainId,
      sourceDocumentId: input.sourceDocumentId,
      evidenceArtifactId: input.evidenceArtifactId,
      requirementId: input.requirementId,
      satisfactionId: input.satisfactionId,
      reviewId: input.reviewId,
      citationId: input.citationId,
      evidenceLinkId: input.evidenceLinkId,
      proofId: input.proofId,
      targetType: input.targetType,
      targetId: input.targetId,
      timestamp,
      payload: input.payload,
      previousHash,
    });

    const event: EvidenceEvent = {
      id: this.ctx.ids.nextId('evidence-event'),
      type: input.type,
      timestamp,
      payload: input.payload,
      eventHash,
      ...(input.trustDomainId !== undefined ? { trustDomainId: input.trustDomainId } : {}),
      ...(input.sourceDocumentId !== undefined ? { sourceDocumentId: input.sourceDocumentId } : {}),
      ...(input.evidenceArtifactId !== undefined ? { evidenceArtifactId: input.evidenceArtifactId } : {}),
      ...(input.requirementId !== undefined ? { requirementId: input.requirementId } : {}),
      ...(input.satisfactionId !== undefined ? { satisfactionId: input.satisfactionId } : {}),
      ...(input.reviewId !== undefined ? { reviewId: input.reviewId } : {}),
      ...(input.citationId !== undefined ? { citationId: input.citationId } : {}),
      ...(input.evidenceLinkId !== undefined ? { evidenceLinkId: input.evidenceLinkId } : {}),
      ...(input.proofId !== undefined ? { proofId: input.proofId } : {}),
      ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };

    return this.store.saveEvent(event);
  }

  getEvents(filter?: EvidenceEventFilter): readonly EvidenceEvent[] {
    const all = this.store.getEvents();
    if (!filter) {
      return all;
    }
    return all.filter(
      (event) =>
        (filter.trustDomainId === undefined || event.trustDomainId === filter.trustDomainId) &&
        (filter.sourceDocumentId === undefined || event.sourceDocumentId === filter.sourceDocumentId) &&
        (filter.evidenceArtifactId === undefined || event.evidenceArtifactId === filter.evidenceArtifactId) &&
        (filter.requirementId === undefined || event.requirementId === filter.requirementId) &&
        (filter.satisfactionId === undefined || event.satisfactionId === filter.satisfactionId) &&
        (filter.reviewId === undefined || event.reviewId === filter.reviewId) &&
        (filter.citationId === undefined || event.citationId === filter.citationId) &&
        (filter.evidenceLinkId === undefined || event.evidenceLinkId === filter.evidenceLinkId) &&
        (filter.proofId === undefined || event.proofId === filter.proofId) &&
        (filter.targetType === undefined || event.targetType === filter.targetType) &&
        (filter.targetId === undefined || event.targetId === filter.targetId),
    );
  }

  getTrailBySourceDocument(sourceDocumentId: string): readonly EvidenceEvent[] {
    return this.getEvents({ sourceDocumentId });
  }

  getTrailByEvidenceArtifact(evidenceArtifactId: string): readonly EvidenceEvent[] {
    return this.getEvents({ evidenceArtifactId });
  }

  getTrailByRequirement(requirementId: string): readonly EvidenceEvent[] {
    return this.getEvents({ requirementId });
  }

  getTrailByProof(proofId: string): readonly EvidenceEvent[] {
    return this.getEvents({ proofId });
  }

  getTrailByTarget(targetType: CitationTargetType, targetId: string): readonly EvidenceEvent[] {
    return this.getEvents({ targetType, targetId });
  }

  getTrailByTrustDomain(trustDomainId: string): readonly EvidenceEvent[] {
    return this.getEvents({ trustDomainId });
  }

  /** Recomputes each event's hash in order and confirms the previousHash chain was never tampered with. */
  verifyChain(): boolean {
    let expectedPrevious: string | undefined;
    for (const event of this.store.getEvents()) {
      if (event.previousHash !== expectedPrevious) {
        return false;
      }
      const recomputedHash = createDigest({
        type: event.type,
        trustDomainId: event.trustDomainId,
        sourceDocumentId: event.sourceDocumentId,
        evidenceArtifactId: event.evidenceArtifactId,
        requirementId: event.requirementId,
        satisfactionId: event.satisfactionId,
        reviewId: event.reviewId,
        citationId: event.citationId,
        evidenceLinkId: event.evidenceLinkId,
        proofId: event.proofId,
        targetType: event.targetType,
        targetId: event.targetId,
        timestamp: event.timestamp,
        payload: event.payload,
        previousHash: event.previousHash,
      });
      if (recomputedHash !== event.eventHash) {
        return false;
      }
      expectedPrevious = event.eventHash;
    }
    return true;
  }
}
