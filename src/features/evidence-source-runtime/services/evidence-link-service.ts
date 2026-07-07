import type { EvidenceLink, EvidenceLinkType } from '../domain/evidence-link.js';
import type { CitationTargetType } from '../domain/citation.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceArtifactNotFoundError, EvidenceRuntimeError } from './evidence-runtime-errors.js';
import type { EvidenceLedger } from './evidence-ledger.js';
import type { EvidenceStore } from './evidence-store.js';

export interface CreateEvidenceLinkInput {
  readonly type: EvidenceLinkType;
  readonly evidenceArtifactId: string;
  readonly targetType: CitationTargetType;
  readonly targetId: string;
  readonly requirementId?: string;
  readonly satisfactionId?: string;
  readonly createdByActorId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Creates and queries EvidenceLinks connecting an EvidenceArtifact to a runtime entity. */
export class EvidenceLinkService {
  constructor(
    private readonly ctx: EvidenceRuntimeContext,
    private readonly store: EvidenceStore,
    private readonly ledger: EvidenceLedger,
  ) {}

  createLink(input: CreateEvidenceLinkInput): EvidenceLink {
    if (!this.store.hasEvidenceArtifact(input.evidenceArtifactId)) {
      throw new EvidenceArtifactNotFoundError(input.evidenceArtifactId);
    }
    if (input.targetId.trim().length === 0) {
      throw new EvidenceRuntimeError('EvidenceLink targetId must not be empty');
    }

    const link: EvidenceLink = {
      id: this.ctx.ids.nextId('evidence-link'),
      type: input.type,
      evidenceArtifactId: input.evidenceArtifactId,
      targetType: input.targetType,
      targetId: input.targetId,
      createdAt: this.ctx.clock.now(),
      ...(input.requirementId !== undefined ? { requirementId: input.requirementId } : {}),
      ...(input.satisfactionId !== undefined ? { satisfactionId: input.satisfactionId } : {}),
      ...(input.createdByActorId !== undefined ? { createdByActorId: input.createdByActorId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    this.store.saveEvidenceLink(link);
    this.ledger.recordEvent({
      type: 'evidence_link_created',
      evidenceArtifactId: link.evidenceArtifactId,
      evidenceLinkId: link.id,
      targetType: link.targetType,
      targetId: link.targetId,
      payload: { type: link.type },
    });
    return link;
  }

  listByArtifact(evidenceArtifactId: string): readonly EvidenceLink[] {
    return this.store.listEvidenceLinksByArtifact(evidenceArtifactId);
  }

  listByTarget(targetType: CitationTargetType, targetId: string): readonly EvidenceLink[] {
    return this.store.listEvidenceLinksByTarget(targetType, targetId);
  }
}
