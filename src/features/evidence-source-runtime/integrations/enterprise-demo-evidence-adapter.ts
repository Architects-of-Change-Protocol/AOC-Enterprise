import type { EvidenceProof } from '../domain/evidence-proof.js';
import type { CitationTargetType } from '../domain/citation.js';

export interface EvidenceDemoScenarioMetadata {
  readonly proofId: string;
  readonly trustDomainId: string;
  readonly targetType?: CitationTargetType;
  readonly targetId?: string;
  readonly sourceDocumentCount: number;
  readonly evidenceArtifactCount: number;
  readonly requirementCount: number;
  readonly satisfactionCount: number;
  readonly reviewCount: number;
  readonly citationCount: number;
  readonly evidenceLinkCount: number;
  readonly proofHash: string;
  readonly previousHash?: string;
}

export interface EvidenceProofChainReference {
  readonly proofId: string;
  readonly trustDomainId: string;
  readonly proofHash: string;
  readonly previousHash?: string;
}

export interface EvidenceDemoExportSnippet {
  readonly scenarioNote: string;
  readonly json: string;
}

/**
 * Derives demo-facing scenario metadata directly from a real EvidenceProof.
 * Every field is read off the proof the runtime actually produced -- this
 * function never invents evidence counts, hashes, or a target the runtime
 * did not itself record.
 */
export function buildEvidenceDemoScenarioMetadata(proof: EvidenceProof): EvidenceDemoScenarioMetadata {
  return {
    proofId: proof.id,
    trustDomainId: proof.trustDomainId,
    sourceDocumentCount: proof.sourceDocumentIds.length,
    evidenceArtifactCount: proof.evidenceArtifactIds.length,
    requirementCount: proof.requirementIds.length,
    satisfactionCount: proof.satisfactionIds.length,
    reviewCount: proof.reviewIds.length,
    citationCount: proof.citationIds.length,
    evidenceLinkCount: proof.evidenceLinkIds.length,
    proofHash: proof.proofHash,
    ...(proof.targetType !== undefined ? { targetType: proof.targetType } : {}),
    ...(proof.targetId !== undefined ? { targetId: proof.targetId } : {}),
    ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
  };
}

export function buildEvidenceProofChainReference(proof: EvidenceProof): EvidenceProofChainReference {
  return {
    proofId: proof.id,
    trustDomainId: proof.trustDomainId,
    proofHash: proof.proofHash,
    ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
  };
}

/**
 * Builds a deterministic, embeddable export snippet for an enterprise demo
 * bundle. The JSON payload is exactly the scenario metadata this function
 * already derived from the real proof -- nothing added, nothing summarized
 * away.
 */
export function buildEvidenceDemoExportSnippet(proof: EvidenceProof): EvidenceDemoExportSnippet {
  const metadata = buildEvidenceDemoScenarioMetadata(proof);
  return {
    scenarioNote: `Evidence / Source / Citation Runtime proof ${metadata.proofId} covers ${metadata.evidenceArtifactCount} evidence artifact(s) across ${metadata.requirementCount} requirement(s)${metadata.targetType !== undefined ? ` for ${metadata.targetType} ${metadata.targetId ?? ''}`.trimEnd() : ''}.`,
    json: JSON.stringify(metadata),
  };
}
