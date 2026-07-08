import type { SourceDocument } from '../../evidence-source-runtime/domain/source-document.js';
import type { EvidenceArtifact } from '../../evidence-source-runtime/domain/evidence-artifact.js';
import type { EvidenceRequirement } from '../../evidence-source-runtime/domain/evidence-requirement.js';
import type { EvidenceProof } from '../../evidence-source-runtime/domain/evidence-proof.js';

/**
 * Maps real Evidence / Source / Citation Runtime records into the summary a
 * pilot binding needs. Statuses are copied verbatim -- this adapter never
 * infers or upgrades evidence sufficiency.
 */
export interface EvidenceBindingSummary {
  readonly sourceDocumentIds: readonly string[];
  readonly evidenceArtifactIds: readonly string[];
  readonly evidenceArtifactStatuses: Readonly<Record<string, EvidenceArtifact['status']>>;
  readonly requirementIds: readonly string[];
  readonly requirementStatuses: Readonly<Record<string, EvidenceRequirement['status']>>;
  readonly proofId?: string;
  readonly proofHash?: string;
}

export function summarizeEvidenceForPilot(
  sourceDocuments: readonly SourceDocument[],
  artifacts: readonly EvidenceArtifact[],
  requirements: readonly EvidenceRequirement[],
  proof?: EvidenceProof,
): EvidenceBindingSummary {
  const evidenceArtifactStatuses: Record<string, EvidenceArtifact['status']> = {};
  for (const artifact of artifacts) {
    evidenceArtifactStatuses[artifact.id] = artifact.status;
  }
  const requirementStatuses: Record<string, EvidenceRequirement['status']> = {};
  for (const requirement of requirements) {
    requirementStatuses[requirement.id] = requirement.status;
  }
  return {
    sourceDocumentIds: sourceDocuments.map((document) => document.id),
    evidenceArtifactIds: artifacts.map((artifact) => artifact.id),
    evidenceArtifactStatuses,
    requirementIds: requirements.map((requirement) => requirement.id),
    requirementStatuses,
    ...(proof !== undefined ? { proofId: proof.id, proofHash: proof.proofHash } : {}),
  };
}

/**
 * A `SourceDocument.legalCompleteness` of `verified_by_customer`/
 * `verified_by_counsel` is always caller-asserted out-of-band -- this
 * function only reports what was asserted, it never derives it from
 * document content, hashes, or evidence presence.
 */
export function sourceDocumentClaimsValidation(document: SourceDocument): boolean {
  return document.legalCompleteness === 'verified_by_customer' || document.legalCompleteness === 'verified_by_counsel';
}
