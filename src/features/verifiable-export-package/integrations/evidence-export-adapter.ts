import type { SourceDocument } from '../../evidence-source-runtime/domain/source-document.js';
import type { EvidenceArtifact } from '../../evidence-source-runtime/domain/evidence-artifact.js';
import type { EvidenceRequirement } from '../../evidence-source-runtime/domain/evidence-requirement.js';
import type { EvidenceSatisfaction } from '../../evidence-source-runtime/domain/evidence-satisfaction.js';
import type { EvidenceReview } from '../../evidence-source-runtime/domain/evidence-review.js';
import type { Citation } from '../../evidence-source-runtime/domain/citation.js';
import type { EvidenceLink } from '../../evidence-source-runtime/domain/evidence-link.js';
import type { EvidenceProof } from '../../evidence-source-runtime/domain/evidence-proof.js';
import type { EvidenceEvent } from '../../evidence-source-runtime/domain/evidence-event.js';
import { createDigest } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';

function buildItem(ctx: ExportRuntimeContext, type: ExportPackageItem['type'], sourceId: string, title: string, summary: string, payload: Record<string, unknown>): ExportPackageItem {
  return {
    id: ctx.ids.nextId('export-item'),
    type,
    sourceModule: 'evidence_source_runtime',
    sourceId,
    title,
    summary,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

/**
 * Maps a real SourceDocument into an ExportPackageItem, preserving
 * `demoOnly`/`legalCompleteness`. This package never claims legal
 * sufficiency for a source document -- it only copies the label the
 * Evidence Runtime already recorded.
 */
export function mapSourceDocumentToItem(ctx: ExportRuntimeContext, document: SourceDocument): ExportPackageItem {
  const payload = { ...document } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'source_document', document.id, `Source document: ${document.title}`, `${document.type}; demoOnly=${document.demoOnly}; legalCompleteness=${document.legalCompleteness}.`, payload);
}

/** Maps a real EvidenceArtifact into an ExportPackageItem. Never evaluates whether the artifact is legally sufficient. */
export function mapEvidenceArtifactToItem(ctx: ExportRuntimeContext, artifact: EvidenceArtifact): ExportPackageItem {
  const payload = { ...artifact } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'evidence_artifact', artifact.id, `Evidence artifact: ${artifact.title}`, `${artifact.type}; status=${artifact.status}.`, payload);
}

/** Maps a real EvidenceRequirement into an ExportPackageItem, preserving cross-runtime source references. */
export function mapEvidenceRequirementToItem(ctx: ExportRuntimeContext, requirement: EvidenceRequirement): ExportPackageItem {
  const payload = { ...requirement } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'evidence_requirement', requirement.id, `Evidence requirement ${requirement.id}`, requirement.description, payload);
}

/** Maps a real EvidenceSatisfaction into an ExportPackageItem. */
export function mapEvidenceSatisfactionToItem(ctx: ExportRuntimeContext, satisfaction: EvidenceSatisfaction): ExportPackageItem {
  const payload = { ...satisfaction } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'evidence_satisfaction', satisfaction.id, `Evidence satisfaction ${satisfaction.id}`, `${satisfaction.status}: ${satisfaction.reason}`, payload);
}

/** Maps a real EvidenceReview into an ExportPackageItem. A review decision is never read as a legal-sufficiency conclusion. */
export function mapEvidenceReviewToItem(ctx: ExportRuntimeContext, review: EvidenceReview): ExportPackageItem {
  const payload = { ...review } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'evidence_review', review.id, `Evidence review ${review.id}`, `${review.decision} by ${review.reviewerActorId}.`, payload);
}

/** Maps a real Citation into an ExportPackageItem. */
export function mapCitationToItem(ctx: ExportRuntimeContext, citation: Citation): ExportPackageItem {
  const payload = { ...citation } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'citation', citation.id, `Citation ${citation.id}`, citation.citationText, payload);
}

/** Maps a real EvidenceLink into an ExportPackageItem. */
export function mapEvidenceLinkToItem(ctx: ExportRuntimeContext, link: EvidenceLink): ExportPackageItem {
  const payload = { ...link } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'evidence_link', link.id, `Evidence link ${link.id}`, `${link.type} -> ${link.targetType}:${link.targetId}.`, payload);
}

/** Maps a real EvidenceProof into an ExportPackageItem, preserving every id-list field and the chained proofHash. */
export function mapEvidenceProofToItem(ctx: ExportRuntimeContext, proof: EvidenceProof): ExportPackageItem {
  const payload = { ...proof } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'evidence_proof', proof.id, `Evidence proof ${proof.id}`, `Covers ${proof.evidenceArtifactIds.length} evidence artifact(s), ${proof.requirementIds.length} requirement(s).`, payload);
}

/** Maps a real EvidenceEvent into an ExportPackageItem, for inclusion in the events section's event trail. */
export function mapEvidenceEventToItem(ctx: ExportRuntimeContext, event: EvidenceEvent): ExportPackageItem {
  const payload = { ...event } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'evidence_event', event.id, `Evidence event ${event.id}`, event.type, payload);
}
