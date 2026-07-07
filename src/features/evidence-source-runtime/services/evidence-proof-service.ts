import { createDigest } from '../domain/evidence-proof.js';
import type { EvidenceProof } from '../domain/evidence-proof.js';
import type { CitationTargetType } from '../domain/citation.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceProofNotFoundError, EvidenceRuntimeError } from './evidence-runtime-errors.js';
import type { EvidenceLedger } from './evidence-ledger.js';
import type { EvidenceStore } from './evidence-store.js';

export interface CreateEvidenceProofInput {
  readonly trustDomainId: string;
  readonly sourceDocumentIds?: readonly string[];
  readonly evidenceArtifactIds?: readonly string[];
  readonly requirementIds?: readonly string[];
  readonly satisfactionIds?: readonly string[];
  readonly reviewIds?: readonly string[];
  readonly citationIds?: readonly string[];
  readonly evidenceLinkIds?: readonly string[];
  readonly targetType?: CitationTargetType;
  readonly targetId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Creates deterministic, hash-chained EvidenceProofs. Each `*Hash` is a pure
 * function of the *current, full* records for the ids the caller listed --
 * so a proof binds to what those records actually contain, and calling
 * createProof again after any of them mutated produces a different hash.
 */
export class EvidenceProofService {
  constructor(
    private readonly ctx: EvidenceRuntimeContext,
    private readonly store: EvidenceStore,
    private readonly ledger: EvidenceLedger,
  ) {}

  createProof(input: CreateEvidenceProofInput): EvidenceProof {
    const sourceDocumentIds = input.sourceDocumentIds ?? [];
    const evidenceArtifactIds = input.evidenceArtifactIds ?? [];
    const requirementIds = input.requirementIds ?? [];
    const satisfactionIds = input.satisfactionIds ?? [];
    const reviewIds = input.reviewIds ?? [];
    const citationIds = input.citationIds ?? [];
    const evidenceLinkIds = input.evidenceLinkIds ?? [];

    const sourceDocuments = sourceDocumentIds.map((id) => this.requireRecord(this.store.getSourceDocument(id), 'source document', id));
    const evidenceArtifacts = evidenceArtifactIds.map((id) => this.requireRecord(this.store.getEvidenceArtifact(id), 'evidence artifact', id));
    const requirements = requirementIds.map((id) => this.requireRecord(this.store.getRequirement(id), 'evidence requirement', id));
    const satisfactions = satisfactionIds.map((id) => this.requireRecord(this.store.getSatisfaction(id), 'evidence satisfaction', id));
    const reviews = reviewIds.map((id) => this.requireRecord(this.store.getReview(id), 'evidence review', id));
    const citations = citationIds.map((id) => this.requireRecord(this.store.getCitation(id), 'citation', id));
    const links = evidenceLinkIds.map((id) => this.requireRecord(this.store.getEvidenceLink(id), 'evidence link', id));

    const sourceHash = createDigest(sourceDocuments);
    const evidenceHash = createDigest(evidenceArtifacts);
    const requirementHash = createDigest(requirements);
    const satisfactionHash = createDigest(satisfactions);
    const reviewHash = createDigest(reviews);
    const citationHash = createDigest(citations);
    const linkHash = createDigest(links);
    const previousHash = this.store.getLatestProof()?.proofHash;

    const proofHash = createDigest({
      sourceHash,
      evidenceHash,
      requirementHash,
      satisfactionHash,
      reviewHash,
      citationHash,
      linkHash,
      targetType: input.targetType,
      targetId: input.targetId,
      previousHash,
    });

    const proof: EvidenceProof = {
      id: this.ctx.ids.nextId('evidence-proof'),
      trustDomainId: input.trustDomainId,
      sourceDocumentIds,
      evidenceArtifactIds,
      requirementIds,
      satisfactionIds,
      reviewIds,
      citationIds,
      evidenceLinkIds,
      sourceHash,
      evidenceHash,
      requirementHash,
      satisfactionHash,
      reviewHash,
      citationHash,
      linkHash,
      proofHash,
      createdAt: this.ctx.clock.now(),
      ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    this.store.saveProof(proof);
    this.ledger.recordEvent({
      type: 'evidence_proof_created',
      proofId: proof.id,
      trustDomainId: proof.trustDomainId,
      ...(proof.targetType !== undefined ? { targetType: proof.targetType } : {}),
      ...(proof.targetId !== undefined ? { targetId: proof.targetId } : {}),
      payload: { proofHash },
    });
    return proof;
  }

  getProof(id: string): EvidenceProof {
    const proof = this.store.getProof(id);
    if (!proof) {
      throw new EvidenceProofNotFoundError(id);
    }
    return proof;
  }

  /** Deterministically re-derives proofHash from the proof's own recorded fields and compares it -- does not re-hash underlying records. */
  verifyProof(proof: EvidenceProof): boolean {
    const recomputedHash = createDigest({
      sourceHash: proof.sourceHash,
      evidenceHash: proof.evidenceHash,
      requirementHash: proof.requirementHash,
      satisfactionHash: proof.satisfactionHash,
      reviewHash: proof.reviewHash,
      citationHash: proof.citationHash,
      linkHash: proof.linkHash,
      targetType: proof.targetType,
      targetId: proof.targetId,
      previousHash: proof.previousHash,
    });
    return recomputedHash === proof.proofHash;
  }

  private requireRecord<T>(record: T | undefined, kind: string, id: string): T {
    if (record === undefined) {
      throw new EvidenceRuntimeError(`Cannot create evidence proof: ${kind} not found: ${id}`);
    }
    return record;
  }
}
