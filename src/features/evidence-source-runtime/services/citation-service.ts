import type { Citation, CitationTargetType } from '../domain/citation.js';
import type { CitationAnchor, CitationAnchorType } from '../domain/citation-anchor.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceArtifactNotFoundError, EvidenceRuntimeError, SourceDocumentNotFoundError } from './evidence-runtime-errors.js';
import type { EvidenceLedger } from './evidence-ledger.js';
import type { EvidenceStore } from './evidence-store.js';

export interface CreateCitationAnchorInput {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly type: CitationAnchorType;
  readonly label: string;
  readonly locator?: string;
  readonly textHash?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreateCitationInput {
  readonly sourceDocumentId?: string;
  readonly evidenceArtifactId?: string;
  readonly targetType: CitationTargetType;
  readonly targetId: string;
  readonly anchorId?: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly createdByActorId?: string;
  /** Overrides the deterministically-generated citation text; still never derived from document content -- callers only ever supply their own text or accept the generated summary. */
  readonly citationText?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Creates CitationAnchors and Citations linking a source document and/or
 * evidence artifact to a decision or proof another Soberanía runtime produced.
 * Anchors are always caller-declared -- this service never extracts a
 * location from document content (no parsing, no OCR).
 */
export class CitationService {
  constructor(
    private readonly ctx: EvidenceRuntimeContext,
    private readonly store: EvidenceStore,
    private readonly ledger: EvidenceLedger,
  ) {}

  createAnchor(input: CreateCitationAnchorInput): CitationAnchor {
    if (!this.store.hasSourceDocument(input.sourceDocumentId)) {
      throw new SourceDocumentNotFoundError(input.sourceDocumentId);
    }
    const anchor: CitationAnchor = {
      id: input.id,
      sourceDocumentId: input.sourceDocumentId,
      type: input.type,
      label: input.label,
      ...(input.locator !== undefined ? { locator: input.locator } : {}),
      ...(input.textHash !== undefined ? { textHash: input.textHash } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    return this.store.saveCitationAnchor(anchor);
  }

  createCitation(input: CreateCitationInput): Citation {
    if (input.sourceDocumentId === undefined && input.evidenceArtifactId === undefined) {
      throw new EvidenceRuntimeError('Citation requires at least one of sourceDocumentId or evidenceArtifactId');
    }

    const sourceDocument = input.sourceDocumentId !== undefined ? this.store.getSourceDocument(input.sourceDocumentId) : undefined;
    if (input.sourceDocumentId !== undefined && !sourceDocument) {
      throw new SourceDocumentNotFoundError(input.sourceDocumentId);
    }

    const artifact = input.evidenceArtifactId !== undefined ? this.store.getEvidenceArtifact(input.evidenceArtifactId) : undefined;
    if (input.evidenceArtifactId !== undefined && !artifact) {
      throw new EvidenceArtifactNotFoundError(input.evidenceArtifactId);
    }

    const anchor = input.anchorId !== undefined ? this.store.getCitationAnchor(input.anchorId) : undefined;
    if (input.anchorId !== undefined && !anchor) {
      throw new EvidenceRuntimeError(`Citation anchor not found: ${input.anchorId}`);
    }

    const citationText = input.citationText ?? buildCitationText(input, sourceDocument?.type, artifact?.type, anchor);

    const citation: Citation = {
      id: this.ctx.ids.nextId('citation'),
      targetType: input.targetType,
      targetId: input.targetId,
      citationText,
      reasonCode: input.reasonCode,
      reason: input.reason,
      createdAt: this.ctx.clock.now(),
      ...(input.sourceDocumentId !== undefined ? { sourceDocumentId: input.sourceDocumentId } : {}),
      ...(input.evidenceArtifactId !== undefined ? { evidenceArtifactId: input.evidenceArtifactId } : {}),
      ...(input.anchorId !== undefined ? { anchorId: input.anchorId } : {}),
      ...(input.createdByActorId !== undefined ? { createdByActorId: input.createdByActorId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    this.store.saveCitation(citation);
    this.ledger.recordEvent({
      type: 'citation_created',
      citationId: citation.id,
      ...(citation.sourceDocumentId !== undefined ? { sourceDocumentId: citation.sourceDocumentId } : {}),
      ...(citation.evidenceArtifactId !== undefined ? { evidenceArtifactId: citation.evidenceArtifactId } : {}),
      targetType: citation.targetType,
      targetId: citation.targetId,
      payload: { reasonCode: citation.reasonCode },
    });
    return citation;
  }

  getAnchor(id: string): CitationAnchor | undefined {
    return this.store.getCitationAnchor(id);
  }

  listByTarget(targetType: CitationTargetType, targetId: string): readonly Citation[] {
    return this.store.listCitationsByTarget(targetType, targetId);
  }
}

function buildCitationText(input: CreateCitationInput, sourceDocumentType: string | undefined, evidenceArtifactType: string | undefined, anchor: CitationAnchor | undefined): string {
  const subjectParts: string[] = [];
  if (input.evidenceArtifactId !== undefined) {
    subjectParts.push(`evidence artifact ${input.evidenceArtifactId}${evidenceArtifactType !== undefined ? ` (${evidenceArtifactType})` : ''}`);
  }
  if (input.sourceDocumentId !== undefined) {
    subjectParts.push(`source document ${input.sourceDocumentId}${sourceDocumentType !== undefined ? ` (${sourceDocumentType})` : ''}`);
  }
  const anchorPart = anchor !== undefined ? ` at ${anchor.type} "${anchor.label}"` : '';
  return `${subjectParts.join(' backed by ')}${anchorPart} cited for ${input.targetType} ${input.targetId}: ${input.reason}`;
}
