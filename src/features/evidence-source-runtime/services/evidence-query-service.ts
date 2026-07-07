import type { SourceDocument, SourceDocumentLegalCompleteness, SourceDocumentStatus, SourceDocumentType } from '../domain/source-document.js';
import type { EvidenceArtifact, EvidenceArtifactStatus, EvidenceArtifactType } from '../domain/evidence-artifact.js';
import type { EvidenceRequirement, EvidenceRequirementSource, EvidenceRequirementStatus } from '../domain/evidence-requirement.js';
import type { Citation, CitationTargetType } from '../domain/citation.js';
import type { EvidenceLink } from '../domain/evidence-link.js';
import type { EvidenceStore } from './evidence-store.js';

const SATISFIED_STATUSES: readonly EvidenceRequirementStatus[] = ['satisfied', 'partially_satisfied', 'waived'];

export interface EvidenceQueryFilter {
  readonly trustDomainId?: string;
  readonly actorId?: string;
  readonly targetType?: CitationTargetType;
  readonly targetId?: string;
  readonly sourceDocumentType?: SourceDocumentType;
  readonly sourceDocumentStatus?: SourceDocumentStatus;
  readonly evidenceArtifactType?: EvidenceArtifactType;
  readonly evidenceArtifactStatus?: EvidenceArtifactStatus;
  readonly requirementSource?: EvidenceRequirementSource;
  readonly requirementStatus?: EvidenceRequirementStatus;
  readonly satisfied?: boolean;
  readonly demoOnly?: boolean;
  readonly legalCompleteness?: SourceDocumentLegalCompleteness;
  readonly text?: string;
}

export interface EvidenceQueryResult {
  readonly sourceDocuments: readonly SourceDocument[];
  readonly evidenceArtifacts: readonly EvidenceArtifact[];
  readonly requirements: readonly EvidenceRequirement[];
  readonly citations: readonly Citation[];
  readonly evidenceLinks: readonly EvidenceLink[];
}

function matchesText(text: string, values: ReadonlyArray<string | undefined>): boolean {
  const needle = text.toLowerCase();
  return values.some((value) => value !== undefined && value.toLowerCase().includes(needle));
}

/**
 * Filters and searches across the evidence graph. This service never
 * mutates state and never invents a record -- it only projects what the
 * EvidenceStore already holds, sorted deterministically by id.
 */
export class EvidenceQueryService {
  constructor(private readonly store: EvidenceStore) {}

  query(filter: EvidenceQueryFilter = {}): EvidenceQueryResult {
    return {
      sourceDocuments: this.querySourceDocuments(filter),
      evidenceArtifacts: this.queryEvidenceArtifacts(filter),
      requirements: this.queryRequirements(filter),
      citations: this.queryCitations(filter),
      evidenceLinks: this.queryEvidenceLinks(filter),
    };
  }

  querySourceDocuments(filter: EvidenceQueryFilter): readonly SourceDocument[] {
    return this.store.listSourceDocuments().filter(
      (document) =>
        (filter.trustDomainId === undefined || document.trustDomainId === filter.trustDomainId) &&
        (filter.actorId === undefined || document.submittedByActorId === filter.actorId || document.reviewedByActorId === filter.actorId) &&
        (filter.sourceDocumentType === undefined || document.type === filter.sourceDocumentType) &&
        (filter.sourceDocumentStatus === undefined || document.status === filter.sourceDocumentStatus) &&
        (filter.demoOnly === undefined || document.demoOnly === filter.demoOnly) &&
        (filter.legalCompleteness === undefined || document.legalCompleteness === filter.legalCompleteness) &&
        (filter.text === undefined || matchesText(filter.text, [document.title, document.description, document.sourceReference, document.metadataHash, document.contentHash])),
    );
  }

  queryEvidenceArtifacts(filter: EvidenceQueryFilter): readonly EvidenceArtifact[] {
    return this.store.listEvidenceArtifacts().filter(
      (artifact) =>
        (filter.trustDomainId === undefined || artifact.trustDomainId === filter.trustDomainId) &&
        (filter.actorId === undefined || artifact.submittedByActorId === filter.actorId || artifact.reviewedByActorId === filter.actorId) &&
        (filter.evidenceArtifactType === undefined || artifact.type === filter.evidenceArtifactType) &&
        (filter.evidenceArtifactStatus === undefined || artifact.status === filter.evidenceArtifactStatus) &&
        (filter.text === undefined || matchesText(filter.text, [artifact.title, artifact.description, artifact.sourceReference, artifact.metadataHash, artifact.contentHash])),
    );
  }

  queryRequirements(filter: EvidenceQueryFilter): readonly EvidenceRequirement[] {
    return this.store.listRequirements().filter(
      (requirement) =>
        (filter.trustDomainId === undefined || requirement.trustDomainId === filter.trustDomainId) &&
        (filter.actorId === undefined || requirement.actorId === filter.actorId) &&
        (filter.requirementSource === undefined || requirement.source === filter.requirementSource) &&
        (filter.requirementStatus === undefined || requirement.status === filter.requirementStatus) &&
        (filter.satisfied === undefined || SATISFIED_STATUSES.includes(requirement.status) === filter.satisfied) &&
        (filter.text === undefined || matchesText(filter.text, [requirement.description])),
    );
  }

  queryCitations(filter: EvidenceQueryFilter): readonly Citation[] {
    return this.store.listCitations().filter(
      (citation) =>
        (filter.targetType === undefined || citation.targetType === filter.targetType) &&
        (filter.targetId === undefined || citation.targetId === filter.targetId) &&
        (filter.text === undefined || matchesText(filter.text, [citation.citationText, citation.reason])),
    );
  }

  queryEvidenceLinks(filter: EvidenceQueryFilter): readonly EvidenceLink[] {
    return this.store.listEvidenceLinks().filter(
      (link) => (filter.targetType === undefined || link.targetType === filter.targetType) && (filter.targetId === undefined || link.targetId === filter.targetId),
    );
  }
}
