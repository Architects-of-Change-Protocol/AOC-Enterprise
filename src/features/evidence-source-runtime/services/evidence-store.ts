import type { SourceDocument, SourceDocumentStatus } from '../domain/source-document.js';
import type { EvidenceArtifact, EvidenceArtifactStatus } from '../domain/evidence-artifact.js';
import type { EvidenceRequirement, EvidenceRequirementStatus } from '../domain/evidence-requirement.js';
import type { EvidenceSatisfaction } from '../domain/evidence-satisfaction.js';
import type { EvidenceReview } from '../domain/evidence-review.js';
import type { Citation, CitationTargetType } from '../domain/citation.js';
import type { CitationAnchor } from '../domain/citation-anchor.js';
import type { EvidenceLink } from '../domain/evidence-link.js';
import type { EvidenceProof } from '../domain/evidence-proof.js';
import type { EvidenceEvent } from '../domain/evidence-event.js';

function byId<T extends { readonly id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Single source of truth for evidence-runtime records. Higher-level
 * services (registries, requirement/satisfaction/review/citation/link/proof
 * services) read the latest persisted record here to compute deterministic
 * ordering/hash chains, then write their result back through this store --
 * the store never computes hashes or business rules itself.
 */
export class EvidenceStore {
  private readonly sourceDocuments = new Map<string, SourceDocument>();
  private readonly evidenceArtifacts = new Map<string, EvidenceArtifact>();
  private readonly requirements = new Map<string, EvidenceRequirement>();
  private readonly satisfactions = new Map<string, EvidenceSatisfaction>();
  private readonly reviews = new Map<string, EvidenceReview>();
  private readonly citations = new Map<string, Citation>();
  private readonly citationAnchors = new Map<string, CitationAnchor>();
  private readonly evidenceLinks = new Map<string, EvidenceLink>();
  private readonly proofs = new Map<string, EvidenceProof>();
  private readonly events: EvidenceEvent[] = [];

  // -- SourceDocument -------------------------------------------------

  saveSourceDocument(document: SourceDocument): SourceDocument {
    this.sourceDocuments.set(document.id, document);
    return document;
  }

  getSourceDocument(id: string): SourceDocument | undefined {
    return this.sourceDocuments.get(id);
  }

  hasSourceDocument(id: string): boolean {
    return this.sourceDocuments.has(id);
  }

  updateSourceDocumentStatus(id: string, status: SourceDocumentStatus, updatedAt: string): SourceDocument | undefined {
    const existing = this.sourceDocuments.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: SourceDocument = { ...existing, status, updatedAt };
    this.sourceDocuments.set(id, updated);
    return updated;
  }

  listSourceDocuments(): readonly SourceDocument[] {
    return [...this.sourceDocuments.values()].sort(byId);
  }

  listSourceDocumentsByTrustDomain(trustDomainId: string): readonly SourceDocument[] {
    return this.listSourceDocuments().filter((document) => document.trustDomainId === trustDomainId);
  }

  // -- EvidenceArtifact -------------------------------------------------

  saveEvidenceArtifact(artifact: EvidenceArtifact): EvidenceArtifact {
    this.evidenceArtifacts.set(artifact.id, artifact);
    return artifact;
  }

  getEvidenceArtifact(id: string): EvidenceArtifact | undefined {
    return this.evidenceArtifacts.get(id);
  }

  hasEvidenceArtifact(id: string): boolean {
    return this.evidenceArtifacts.has(id);
  }

  updateEvidenceArtifactStatus(id: string, status: EvidenceArtifactStatus): EvidenceArtifact | undefined {
    const existing = this.evidenceArtifacts.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: EvidenceArtifact = { ...existing, status };
    this.evidenceArtifacts.set(id, updated);
    return updated;
  }

  listEvidenceArtifacts(): readonly EvidenceArtifact[] {
    return [...this.evidenceArtifacts.values()].sort(byId);
  }

  listEvidenceArtifactsByTrustDomain(trustDomainId: string): readonly EvidenceArtifact[] {
    return this.listEvidenceArtifacts().filter((artifact) => artifact.trustDomainId === trustDomainId);
  }

  listEvidenceArtifactsBySourceDocument(sourceDocumentId: string): readonly EvidenceArtifact[] {
    return this.listEvidenceArtifacts().filter((artifact) => artifact.sourceDocumentId === sourceDocumentId);
  }

  // -- EvidenceRequirement -------------------------------------------------

  saveRequirement(requirement: EvidenceRequirement): EvidenceRequirement {
    this.requirements.set(requirement.id, requirement);
    return requirement;
  }

  getRequirement(id: string): EvidenceRequirement | undefined {
    return this.requirements.get(id);
  }

  updateRequirement(id: string, patch: Partial<EvidenceRequirement>): EvidenceRequirement | undefined {
    const existing = this.requirements.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: EvidenceRequirement = { ...existing, ...patch };
    this.requirements.set(id, updated);
    return updated;
  }

  listRequirements(): readonly EvidenceRequirement[] {
    return [...this.requirements.values()].sort(byId);
  }

  listRequirementsByTrustDomain(trustDomainId: string): readonly EvidenceRequirement[] {
    return this.listRequirements().filter((requirement) => requirement.trustDomainId === trustDomainId);
  }

  listRequirementsBySource(source: EvidenceRequirement['source']): readonly EvidenceRequirement[] {
    return this.listRequirements().filter((requirement) => requirement.source === source);
  }

  listOpenRequirements(): readonly EvidenceRequirement[] {
    return this.listRequirements().filter((requirement) => requirement.status === 'open' || requirement.status === 'partially_satisfied');
  }

  listRequirementsByPolicyDecision(policyDecisionId: string): readonly EvidenceRequirement[] {
    return this.listRequirements().filter((requirement) => requirement.policyDecisionId === policyDecisionId);
  }

  listRequirementsByApprovalRequest(approvalRequestId: string): readonly EvidenceRequirement[] {
    return this.listRequirements().filter((requirement) => requirement.approvalRequestId === approvalRequestId);
  }

  listRequirementsByRecognitionDecision(recognitionDecisionId: string): readonly EvidenceRequirement[] {
    return this.listRequirements().filter((requirement) => requirement.recognitionDecisionId === recognitionDecisionId);
  }

  listRequirementsByEnforcementDecision(enforcementDecisionId: string): readonly EvidenceRequirement[] {
    return this.listRequirements().filter((requirement) => requirement.enforcementDecisionId === enforcementDecisionId);
  }

  // -- EvidenceSatisfaction -------------------------------------------------

  saveSatisfaction(satisfaction: EvidenceSatisfaction): EvidenceSatisfaction {
    this.satisfactions.set(satisfaction.id, satisfaction);
    return satisfaction;
  }

  getSatisfaction(id: string): EvidenceSatisfaction | undefined {
    return this.satisfactions.get(id);
  }

  listSatisfactions(): readonly EvidenceSatisfaction[] {
    return [...this.satisfactions.values()].sort(byId);
  }

  listSatisfactionsByRequirement(requirementId: string): readonly EvidenceSatisfaction[] {
    return this.listSatisfactions().filter((satisfaction) => satisfaction.requirementId === requirementId);
  }

  // -- EvidenceReview -------------------------------------------------

  saveReview(review: EvidenceReview): EvidenceReview {
    this.reviews.set(review.id, review);
    return review;
  }

  getReview(id: string): EvidenceReview | undefined {
    return this.reviews.get(id);
  }

  listReviews(): readonly EvidenceReview[] {
    return [...this.reviews.values()].sort(byId);
  }

  listReviewsByArtifact(evidenceArtifactId: string): readonly EvidenceReview[] {
    return this.listReviews().filter((review) => review.evidenceArtifactId === evidenceArtifactId);
  }

  // -- CitationAnchor -------------------------------------------------

  saveCitationAnchor(anchor: CitationAnchor): CitationAnchor {
    this.citationAnchors.set(anchor.id, anchor);
    return anchor;
  }

  getCitationAnchor(id: string): CitationAnchor | undefined {
    return this.citationAnchors.get(id);
  }

  listCitationAnchorsBySourceDocument(sourceDocumentId: string): readonly CitationAnchor[] {
    return [...this.citationAnchors.values()].sort(byId).filter((anchor) => anchor.sourceDocumentId === sourceDocumentId);
  }

  // -- Citation -------------------------------------------------

  saveCitation(citation: Citation): Citation {
    this.citations.set(citation.id, citation);
    return citation;
  }

  getCitation(id: string): Citation | undefined {
    return this.citations.get(id);
  }

  listCitations(): readonly Citation[] {
    return [...this.citations.values()].sort(byId);
  }

  listCitationsByTarget(targetType: CitationTargetType, targetId: string): readonly Citation[] {
    return this.listCitations().filter((citation) => citation.targetType === targetType && citation.targetId === targetId);
  }

  // -- EvidenceLink -------------------------------------------------

  saveEvidenceLink(link: EvidenceLink): EvidenceLink {
    this.evidenceLinks.set(link.id, link);
    return link;
  }

  getEvidenceLink(id: string): EvidenceLink | undefined {
    return this.evidenceLinks.get(id);
  }

  listEvidenceLinks(): readonly EvidenceLink[] {
    return [...this.evidenceLinks.values()].sort(byId);
  }

  listEvidenceLinksByArtifact(evidenceArtifactId: string): readonly EvidenceLink[] {
    return this.listEvidenceLinks().filter((link) => link.evidenceArtifactId === evidenceArtifactId);
  }

  listEvidenceLinksByTarget(targetType: CitationTargetType, targetId: string): readonly EvidenceLink[] {
    return this.listEvidenceLinks().filter((link) => link.targetType === targetType && link.targetId === targetId);
  }

  // -- EvidenceProof -------------------------------------------------

  saveProof(proof: EvidenceProof): EvidenceProof {
    this.proofs.set(proof.id, proof);
    return proof;
  }

  getProof(id: string): EvidenceProof | undefined {
    return this.proofs.get(id);
  }

  listProofs(): readonly EvidenceProof[] {
    return [...this.proofs.values()].sort(byId);
  }

  listProofsByTarget(targetType: CitationTargetType, targetId: string): readonly EvidenceProof[] {
    return this.listProofs().filter((proof) => proof.targetType === targetType && proof.targetId === targetId);
  }

  listProofsByTrustDomain(trustDomainId: string): readonly EvidenceProof[] {
    return this.listProofs().filter((proof) => proof.trustDomainId === trustDomainId);
  }

  getLatestProof(): EvidenceProof | undefined {
    return this.proofs.size === 0 ? undefined : [...this.proofs.values()].at(-1);
  }

  // -- EvidenceEvent -------------------------------------------------

  saveEvent(event: EvidenceEvent): EvidenceEvent {
    this.events.push(event);
    return event;
  }

  getLatestEvent(): EvidenceEvent | undefined {
    return this.events.at(-1);
  }

  getEvents(): readonly EvidenceEvent[] {
    return [...this.events];
  }
}
