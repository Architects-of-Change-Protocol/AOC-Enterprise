import type { SourceDocument } from '../domain/source-document.js';
import type { EvidenceArtifact } from '../domain/evidence-artifact.js';
import type { EvidenceRequirement } from '../domain/evidence-requirement.js';
import type { EvidenceSatisfaction } from '../domain/evidence-satisfaction.js';
import type { EvidenceReview } from '../domain/evidence-review.js';
import type { Citation } from '../domain/citation.js';
import type { CitationAnchor } from '../domain/citation-anchor.js';
import type { EvidenceLink } from '../domain/evidence-link.js';
import type { EvidenceProof } from '../domain/evidence-proof.js';
import type { EvidenceEvent } from '../domain/evidence-event.js';
import type { EvidenceRuntime } from '../services/evidence-runtime.js';

export interface SourceDocumentRow {
  readonly id: string;
  readonly type: SourceDocument['type'];
  readonly title: string;
  readonly status: SourceDocument['status'];
  readonly authority: SourceDocument['authority'];
  readonly demoOnly: boolean;
  readonly legalCompleteness: SourceDocument['legalCompleteness'];
  readonly metadataHash: string;
  readonly trustDomainId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EvidenceArtifactRow {
  readonly id: string;
  readonly type: EvidenceArtifact['type'];
  readonly title: string;
  readonly status: EvidenceArtifact['status'];
  readonly trustDomainId: string;
  readonly sourceDocumentId?: string;
  readonly submittedByActorId: string;
  readonly submittedAt: string;
  readonly reviewedByActorId?: string;
  readonly metadataHash: string;
}

export interface EvidenceRequirementRow {
  readonly id: string;
  readonly type: EvidenceRequirement['type'];
  readonly source: EvidenceRequirement['source'];
  readonly status: EvidenceRequirement['status'];
  readonly required: boolean;
  readonly trustDomainId: string;
  readonly description: string;
  readonly sourceRequirementId?: string;
  readonly policyDecisionId?: string;
  readonly approvalRequestId?: string;
  readonly recognitionDecisionId?: string;
  readonly enforcementDecisionId?: string;
  readonly createdAt: string;
}

export interface EvidenceSatisfactionRow {
  readonly id: string;
  readonly requirementId: string;
  readonly status: EvidenceSatisfaction['status'];
  readonly evidenceArtifactIds: readonly string[];
  readonly reasonCode: string;
  readonly satisfiedAt: string;
  readonly proofId?: string;
}

export interface EvidenceReviewRow {
  readonly id: string;
  readonly decision: EvidenceReview['decision'];
  readonly reviewerActorId: string;
  readonly evidenceArtifactId?: string;
  readonly requirementId?: string;
  readonly reasonCode: string;
  readonly reviewedAt: string;
}

export interface CitationRow {
  readonly id: string;
  readonly targetType: Citation['targetType'];
  readonly targetId: string;
  readonly citationText: string;
  readonly reasonCode: string;
  readonly sourceDocumentId?: string;
  readonly evidenceArtifactId?: string;
  readonly createdAt: string;
}

export interface CitationAnchorRow {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly type: CitationAnchor['type'];
  readonly label: string;
  readonly locator?: string;
}

export interface EvidenceLinkRow {
  readonly id: string;
  readonly type: EvidenceLink['type'];
  readonly evidenceArtifactId: string;
  readonly targetType: EvidenceLink['targetType'];
  readonly targetId: string;
  readonly requirementId?: string;
  readonly satisfactionId?: string;
  readonly createdAt: string;
}

export interface EvidenceProofRow {
  readonly id: string;
  readonly trustDomainId: string;
  readonly targetType?: EvidenceProof['targetType'];
  readonly targetId?: string;
  readonly proofHash: string;
  readonly previousHash?: string;
  readonly sourceDocumentCount: number;
  readonly evidenceArtifactCount: number;
  readonly requirementCount: number;
  readonly createdAt: string;
}

export interface EvidenceEventRow {
  readonly id: string;
  readonly type: EvidenceEvent['type'];
  readonly summary: string;
  readonly trustDomainId?: string;
  readonly timestamp: string;
  readonly eventHash: string;
  readonly previousHash?: string;
}

export interface EvidenceControlPlaneViewModel {
  readonly sourceDocuments: readonly SourceDocumentRow[];
  readonly evidenceArtifacts: readonly EvidenceArtifactRow[];
  readonly evidenceRequirements: readonly EvidenceRequirementRow[];
  readonly evidenceSatisfactions: readonly EvidenceSatisfactionRow[];
  readonly evidenceReviews: readonly EvidenceReviewRow[];
  readonly citations: readonly CitationRow[];
  readonly citationAnchors: readonly CitationAnchorRow[];
  readonly evidenceLinks: readonly EvidenceLinkRow[];
  readonly evidenceProofs: readonly EvidenceProofRow[];
  readonly evidenceEvents: readonly EvidenceEventRow[];
}

function titleCase(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function toSourceDocumentRow(document: SourceDocument): SourceDocumentRow {
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    status: document.status,
    authority: document.authority,
    demoOnly: document.demoOnly,
    legalCompleteness: document.legalCompleteness,
    metadataHash: document.metadataHash,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    ...(document.trustDomainId !== undefined ? { trustDomainId: document.trustDomainId } : {}),
  };
}

export function toEvidenceArtifactRow(artifact: EvidenceArtifact): EvidenceArtifactRow {
  return {
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    status: artifact.status,
    trustDomainId: artifact.trustDomainId,
    submittedByActorId: artifact.submittedByActorId,
    submittedAt: artifact.submittedAt,
    metadataHash: artifact.metadataHash,
    ...(artifact.sourceDocumentId !== undefined ? { sourceDocumentId: artifact.sourceDocumentId } : {}),
    ...(artifact.reviewedByActorId !== undefined ? { reviewedByActorId: artifact.reviewedByActorId } : {}),
  };
}

export function toEvidenceRequirementRow(requirement: EvidenceRequirement): EvidenceRequirementRow {
  return {
    id: requirement.id,
    type: requirement.type,
    source: requirement.source,
    status: requirement.status,
    required: requirement.required,
    trustDomainId: requirement.trustDomainId,
    description: requirement.description,
    createdAt: requirement.createdAt,
    ...(requirement.sourceRequirementId !== undefined ? { sourceRequirementId: requirement.sourceRequirementId } : {}),
    ...(requirement.policyDecisionId !== undefined ? { policyDecisionId: requirement.policyDecisionId } : {}),
    ...(requirement.approvalRequestId !== undefined ? { approvalRequestId: requirement.approvalRequestId } : {}),
    ...(requirement.recognitionDecisionId !== undefined ? { recognitionDecisionId: requirement.recognitionDecisionId } : {}),
    ...(requirement.enforcementDecisionId !== undefined ? { enforcementDecisionId: requirement.enforcementDecisionId } : {}),
  };
}

export function toEvidenceSatisfactionRow(satisfaction: EvidenceSatisfaction): EvidenceSatisfactionRow {
  return {
    id: satisfaction.id,
    requirementId: satisfaction.requirementId,
    status: satisfaction.status,
    evidenceArtifactIds: satisfaction.evidenceArtifactIds,
    reasonCode: satisfaction.reasonCode,
    satisfiedAt: satisfaction.satisfiedAt,
    ...(satisfaction.proofId !== undefined ? { proofId: satisfaction.proofId } : {}),
  };
}

export function toEvidenceReviewRow(review: EvidenceReview): EvidenceReviewRow {
  return {
    id: review.id,
    decision: review.decision,
    reviewerActorId: review.reviewerActorId,
    reasonCode: review.reasonCode,
    reviewedAt: review.reviewedAt,
    ...(review.evidenceArtifactId !== undefined ? { evidenceArtifactId: review.evidenceArtifactId } : {}),
    ...(review.requirementId !== undefined ? { requirementId: review.requirementId } : {}),
  };
}

export function toCitationRow(citation: Citation): CitationRow {
  return {
    id: citation.id,
    targetType: citation.targetType,
    targetId: citation.targetId,
    citationText: citation.citationText,
    reasonCode: citation.reasonCode,
    createdAt: citation.createdAt,
    ...(citation.sourceDocumentId !== undefined ? { sourceDocumentId: citation.sourceDocumentId } : {}),
    ...(citation.evidenceArtifactId !== undefined ? { evidenceArtifactId: citation.evidenceArtifactId } : {}),
  };
}

export function toCitationAnchorRow(anchor: CitationAnchor): CitationAnchorRow {
  return {
    id: anchor.id,
    sourceDocumentId: anchor.sourceDocumentId,
    type: anchor.type,
    label: anchor.label,
    ...(anchor.locator !== undefined ? { locator: anchor.locator } : {}),
  };
}

export function toEvidenceLinkRow(link: EvidenceLink): EvidenceLinkRow {
  return {
    id: link.id,
    type: link.type,
    evidenceArtifactId: link.evidenceArtifactId,
    targetType: link.targetType,
    targetId: link.targetId,
    createdAt: link.createdAt,
    ...(link.requirementId !== undefined ? { requirementId: link.requirementId } : {}),
    ...(link.satisfactionId !== undefined ? { satisfactionId: link.satisfactionId } : {}),
  };
}

export function toEvidenceProofRow(proof: EvidenceProof): EvidenceProofRow {
  return {
    id: proof.id,
    trustDomainId: proof.trustDomainId,
    proofHash: proof.proofHash,
    sourceDocumentCount: proof.sourceDocumentIds.length,
    evidenceArtifactCount: proof.evidenceArtifactIds.length,
    requirementCount: proof.requirementIds.length,
    createdAt: proof.createdAt,
    ...(proof.targetType !== undefined ? { targetType: proof.targetType } : {}),
    ...(proof.targetId !== undefined ? { targetId: proof.targetId } : {}),
    ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
  };
}

export function toEvidenceEventRow(event: EvidenceEvent): EvidenceEventRow {
  const contextParts: string[] = [];
  if (event.sourceDocumentId !== undefined) contextParts.push(`source document ${event.sourceDocumentId}`);
  if (event.evidenceArtifactId !== undefined) contextParts.push(`artifact ${event.evidenceArtifactId}`);
  if (event.requirementId !== undefined) contextParts.push(`requirement ${event.requirementId}`);
  if (event.proofId !== undefined) contextParts.push(`proof ${event.proofId}`);
  const summary = contextParts.length > 0 ? `${titleCase(event.type)} (${contextParts.join(', ')})` : titleCase(event.type);

  return {
    id: event.id,
    type: event.type,
    summary,
    timestamp: event.timestamp,
    eventHash: event.eventHash,
    ...(event.trustDomainId !== undefined ? { trustDomainId: event.trustDomainId } : {}),
    ...(event.previousHash !== undefined ? { previousHash: event.previousHash } : {}),
  };
}

/**
 * Builds a read-model-only snapshot of an EvidenceRuntime for Control Plane
 * display. This function only maps already-recorded runtime state -- it
 * never mutates the runtime and never synthesizes a record the runtime did
 * not itself produce.
 */
export function buildEvidenceControlPlaneViewModel(runtime: EvidenceRuntime): EvidenceControlPlaneViewModel {
  return {
    sourceDocuments: runtime.store.listSourceDocuments().map(toSourceDocumentRow),
    evidenceArtifacts: runtime.store.listEvidenceArtifacts().map(toEvidenceArtifactRow),
    evidenceRequirements: runtime.store.listRequirements().map(toEvidenceRequirementRow),
    evidenceSatisfactions: runtime.store.listSatisfactions().map(toEvidenceSatisfactionRow),
    evidenceReviews: runtime.store.listReviews().map(toEvidenceReviewRow),
    citations: runtime.store.listCitations().map(toCitationRow),
    citationAnchors: runtime.store
      .listSourceDocuments()
      .flatMap((document) => runtime.store.listCitationAnchorsBySourceDocument(document.id))
      .map(toCitationAnchorRow),
    evidenceLinks: runtime.store.listEvidenceLinks().map(toEvidenceLinkRow),
    evidenceProofs: runtime.store.listProofs().map(toEvidenceProofRow),
    evidenceEvents: runtime.ledger.getEvents().map(toEvidenceEventRow),
  };
}
