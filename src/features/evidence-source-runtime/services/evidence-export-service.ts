import type { EvidenceExportArtifact } from '../domain/evidence-export.js';
import type { CitationTargetType } from '../domain/citation.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceProofNotFoundError } from './evidence-runtime-errors.js';
import type { EvidenceStore } from './evidence-store.js';

export interface ExportEvidenceSummaryInput {
  readonly trustDomainId?: string;
}

/**
 * Produces string-only export artifacts (JSON or markdown) from what is
 * already recorded in the EvidenceStore. This service never writes to the
 * filesystem and never summarizes away a record -- every id referenced by
 * an export is resolvable back to the store.
 */
export class EvidenceExportService {
  constructor(
    private readonly ctx: EvidenceRuntimeContext,
    private readonly store: EvidenceStore,
  ) {}

  exportJsonSummary(input: ExportEvidenceSummaryInput = {}): EvidenceExportArtifact {
    const sourceDocuments = input.trustDomainId !== undefined ? this.store.listSourceDocumentsByTrustDomain(input.trustDomainId) : this.store.listSourceDocuments();
    const evidenceArtifacts = input.trustDomainId !== undefined ? this.store.listEvidenceArtifactsByTrustDomain(input.trustDomainId) : this.store.listEvidenceArtifacts();
    const requirements = input.trustDomainId !== undefined ? this.store.listRequirementsByTrustDomain(input.trustDomainId) : this.store.listRequirements();
    const satisfactions = this.store.listSatisfactions();
    const citations = this.store.listCitations();
    const proofs = input.trustDomainId !== undefined ? this.store.listProofsByTrustDomain(input.trustDomainId) : this.store.listProofs();

    const summary = {
      sourceDocuments,
      evidenceArtifacts,
      requirements,
      satisfactions,
      citations,
      proofs,
    };

    return this.buildArtifact('json_summary', 'Evidence Summary (JSON)', JSON.stringify(summary));
  }

  exportCitationTrailMarkdown(targetType: CitationTargetType, targetId: string): EvidenceExportArtifact {
    const citations = this.store.listCitationsByTarget(targetType, targetId);
    const lines = [`# Citation trail for ${targetType} ${targetId}`, ''];
    if (citations.length === 0) {
      lines.push('_No citations recorded for this target._');
    }
    for (const citation of citations) {
      lines.push(`- [${citation.id}] ${citation.citationText} (${citation.reasonCode})`);
    }
    return this.buildArtifact('citation_trail', `Citation trail: ${targetType} ${targetId}`, lines.join('\n'), targetType, targetId);
  }

  exportEvidenceTraceMarkdown(requirementId: string): EvidenceExportArtifact {
    const requirement = this.store.getRequirement(requirementId);
    const satisfactions = this.store.listSatisfactionsByRequirement(requirementId);
    const lines = [`# Evidence trace for requirement ${requirementId}`, ''];
    if (!requirement) {
      lines.push('_Requirement not found._');
      return this.buildArtifact('evidence_trace', `Evidence trace: ${requirementId}`, lines.join('\n'));
    }
    lines.push(`- type: ${requirement.type}`, `- source: ${requirement.source}`, `- status: ${requirement.status}`, `- description: ${requirement.description}`, '');
    lines.push('## Satisfactions', '');
    if (satisfactions.length === 0) {
      lines.push('_No satisfactions recorded._');
    }
    for (const satisfaction of satisfactions) {
      lines.push(`- [${satisfaction.id}] status=${satisfaction.status} evidence=${satisfaction.evidenceArtifactIds.join(', ')} (${satisfaction.reasonCode})`);
      const reviews = satisfaction.evidenceArtifactIds.flatMap((artifactId) => this.store.listReviewsByArtifact(artifactId));
      for (const review of reviews) {
        lines.push(`  - review [${review.id}] decision=${review.decision} by ${review.reviewerActorId}`);
      }
    }
    return this.buildArtifact('evidence_trace', `Evidence trace: ${requirementId}`, lines.join('\n'));
  }

  exportAuditBundleFragment(proofId: string): EvidenceExportArtifact {
    const proof = this.store.getProof(proofId);
    if (!proof) {
      throw new EvidenceProofNotFoundError(proofId);
    }
    const fragment = {
      proof,
      sourceDocuments: proof.sourceDocumentIds.map((id) => this.store.getSourceDocument(id)),
      evidenceArtifacts: proof.evidenceArtifactIds.map((id) => this.store.getEvidenceArtifact(id)),
      requirements: proof.requirementIds.map((id) => this.store.getRequirement(id)),
      satisfactions: proof.satisfactionIds.map((id) => this.store.getSatisfaction(id)),
      reviews: proof.reviewIds.map((id) => this.store.getReview(id)),
      citations: proof.citationIds.map((id) => this.store.getCitation(id)),
      evidenceLinks: proof.evidenceLinkIds.map((id) => this.store.getEvidenceLink(id)),
    };
    return this.buildArtifact(
      'audit_bundle_fragment',
      `Audit bundle fragment: proof ${proofId}`,
      JSON.stringify(fragment),
      proof.targetType,
      proof.targetId,
      proof.id,
    );
  }

  private buildArtifact(
    type: EvidenceExportArtifact['type'],
    title: string,
    content: string,
    targetType?: CitationTargetType,
    targetId?: string,
    evidenceProofId?: string,
  ): EvidenceExportArtifact {
    return {
      id: this.ctx.ids.nextId('evidence-export'),
      type,
      title,
      content,
      createdAt: this.ctx.clock.now(),
      ...(targetType !== undefined ? { targetType } : {}),
      ...(targetId !== undefined ? { targetId } : {}),
      ...(evidenceProofId !== undefined ? { evidenceProofId } : {}),
    };
  }
}
