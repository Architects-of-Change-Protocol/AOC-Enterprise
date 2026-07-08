import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapSourceDocumentToItem,
  mapEvidenceArtifactToItem,
  mapEvidenceRequirementToItem,
  mapEvidenceSatisfactionToItem,
  mapEvidenceReviewToItem,
  mapCitationToItem,
  mapEvidenceLinkToItem,
  mapEvidenceProofToItem,
  mapEvidenceEventToItem,
} from '../../integrations/evidence-export-adapter.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { SourceDocument } from '../../../evidence-source-runtime/domain/source-document.js';
import type { EvidenceArtifact } from '../../../evidence-source-runtime/domain/evidence-artifact.js';
import type { EvidenceRequirement } from '../../../evidence-source-runtime/domain/evidence-requirement.js';
import type { EvidenceSatisfaction } from '../../../evidence-source-runtime/domain/evidence-satisfaction.js';
import type { EvidenceReview } from '../../../evidence-source-runtime/domain/evidence-review.js';
import type { Citation } from '../../../evidence-source-runtime/domain/citation.js';
import type { EvidenceLink } from '../../../evidence-source-runtime/domain/evidence-link.js';
import type { EvidenceProof } from '../../../evidence-source-runtime/domain/evidence-proof.js';
import type { EvidenceEvent } from '../../../evidence-source-runtime/domain/evidence-event.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeSourceDocument(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: 'source-document-1',
    type: 'contract',
    title: 'Master Services Agreement',
    status: 'active',
    authority: 'customer_provided',
    metadataHash: 'metadata-hash-1',
    demoOnly: false,
    legalCompleteness: 'customer_provided',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeEvidenceArtifact(overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  return {
    id: 'evidence-artifact-1',
    type: 'invoice',
    title: 'Invoice 1042',
    status: 'accepted',
    trustDomainId: 'trust-domain-1',
    submittedByActorId: 'actor-1',
    submittedAt: NOW,
    metadataHash: 'metadata-hash-1',
    tags: [],
    ...overrides,
  };
}

function makeRequirement(overrides: Partial<EvidenceRequirement> = {}): EvidenceRequirement {
  return {
    id: 'evidence-requirement-1',
    type: 'invoice',
    source: 'policy_pack',
    trustDomainId: 'trust-domain-1',
    description: 'Invoice must be presented before payment.',
    required: true,
    status: 'open',
    createdAt: NOW,
    ...overrides,
  };
}

function makeSatisfaction(overrides: Partial<EvidenceSatisfaction> = {}): EvidenceSatisfaction {
  return {
    id: 'evidence-satisfaction-1',
    requirementId: 'evidence-requirement-1',
    evidenceArtifactIds: ['evidence-artifact-1'],
    status: 'satisfied',
    satisfiedAt: NOW,
    reasonCode: 'SATISFIED',
    reason: 'Invoice matched the requirement.',
    ...overrides,
  };
}

function makeReview(overrides: Partial<EvidenceReview> = {}): EvidenceReview {
  return {
    id: 'evidence-review-1',
    reviewerActorId: 'reviewer-1',
    decision: 'accepted',
    reasonCode: 'ACCEPTED',
    reason: 'Invoice content matches purchase order.',
    reviewedAt: NOW,
    ...overrides,
  };
}

function makeCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    id: 'citation-1',
    targetType: 'enforcement_decision',
    targetId: 'enforcement-decision-1',
    citationText: 'Invoice 1042, section 3.',
    reasonCode: 'CITED',
    reason: 'Cited as supporting evidence.',
    createdAt: NOW,
    ...overrides,
  };
}

function makeEvidenceLink(overrides: Partial<EvidenceLink> = {}): EvidenceLink {
  return {
    id: 'evidence-link-1',
    type: 'supports',
    evidenceArtifactId: 'evidence-artifact-1',
    targetType: 'enforcement_decision',
    targetId: 'enforcement-decision-1',
    createdAt: NOW,
    ...overrides,
  };
}

function makeProof(overrides: Partial<EvidenceProof> = {}): EvidenceProof {
  return {
    id: 'evidence-proof-1',
    trustDomainId: 'trust-domain-1',
    sourceDocumentIds: ['source-document-1'],
    evidenceArtifactIds: ['evidence-artifact-1'],
    requirementIds: ['evidence-requirement-1'],
    satisfactionIds: ['evidence-satisfaction-1'],
    reviewIds: ['evidence-review-1'],
    citationIds: ['citation-1'],
    evidenceLinkIds: ['evidence-link-1'],
    sourceHash: 'source-hash-1',
    evidenceHash: 'evidence-hash-1',
    requirementHash: 'requirement-hash-1',
    satisfactionHash: 'satisfaction-hash-1',
    reviewHash: 'review-hash-1',
    citationHash: 'citation-hash-1',
    linkHash: 'link-hash-1',
    proofHash: 'proof-hash-1',
    createdAt: NOW,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    id: 'evidence-event-1',
    type: 'evidence_proof_created',
    timestamp: NOW,
    payload: {},
    eventHash: 'event-hash-1',
    ...overrides,
  };
}

describe('evidence-export-adapter', () => {
  it('1. mapSourceDocumentToItem preserves demoOnly/legalCompleteness verbatim, never claiming legal sufficiency', () => {
    const ctx = createExportRuntimeContext(NOW);
    const document = makeSourceDocument({ demoOnly: false, legalCompleteness: 'not_legal_advice' });
    const item = mapSourceDocumentToItem(ctx, document);

    assert.equal(item.type, 'source_document');
    assert.equal(item.sourceModule, 'evidence_source_runtime');
    assert.equal(item.sourceId, document.id);
    assert.equal(item.payload.demoOnly, false);
    assert.equal(item.payload.legalCompleteness, 'not_legal_advice');
    assert.notEqual(item.payload.legalCompleteness, 'verified_by_counsel');
  });

  it('2. mapEvidenceArtifactToItem maps an EvidenceArtifact to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const artifact = makeEvidenceArtifact();
    const item = mapEvidenceArtifactToItem(ctx, artifact);

    assert.equal(item.type, 'evidence_artifact');
    assert.equal(item.sourceModule, 'evidence_source_runtime');
    assert.equal(item.sourceId, artifact.id);
    assert.equal(item.payload.status, artifact.status);
  });

  it('3. mapEvidenceRequirementToItem maps an EvidenceRequirement to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const requirement = makeRequirement();
    const item = mapEvidenceRequirementToItem(ctx, requirement);

    assert.equal(item.type, 'evidence_requirement');
    assert.equal(item.sourceModule, 'evidence_source_runtime');
    assert.equal(item.sourceId, requirement.id);
    assert.equal(item.payload.description, requirement.description);
  });

  it('4. mapEvidenceSatisfactionToItem maps an EvidenceSatisfaction to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const satisfaction = makeSatisfaction();
    const item = mapEvidenceSatisfactionToItem(ctx, satisfaction);

    assert.equal(item.type, 'evidence_satisfaction');
    assert.equal(item.sourceModule, 'evidence_source_runtime');
    assert.equal(item.sourceId, satisfaction.id);
    assert.equal(item.payload.status, satisfaction.status);
  });

  it('5. mapEvidenceReviewToItem maps an EvidenceReview to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const review = makeReview();
    const item = mapEvidenceReviewToItem(ctx, review);

    assert.equal(item.type, 'evidence_review');
    assert.equal(item.sourceModule, 'evidence_source_runtime');
    assert.equal(item.sourceId, review.id);
    assert.equal(item.payload.decision, review.decision);
  });

  it('6. mapCitationToItem maps a Citation to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const citation = makeCitation();
    const item = mapCitationToItem(ctx, citation);

    assert.equal(item.type, 'citation');
    assert.equal(item.sourceModule, 'evidence_source_runtime');
    assert.equal(item.sourceId, citation.id);
    assert.equal(item.payload.citationText, citation.citationText);
  });

  it('7. mapEvidenceLinkToItem maps an EvidenceLink to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const link = makeEvidenceLink();
    const item = mapEvidenceLinkToItem(ctx, link);

    assert.equal(item.type, 'evidence_link');
    assert.equal(item.sourceModule, 'evidence_source_runtime');
    assert.equal(item.sourceId, link.id);
    assert.equal(item.payload.type, link.type);
  });

  it('8. mapEvidenceProofToItem preserves every id-list field and proofHash verbatim', () => {
    const ctx = createExportRuntimeContext(NOW);
    const proof = makeProof({
      sourceDocumentIds: ['source-document-1', 'source-document-2'],
      evidenceArtifactIds: ['evidence-artifact-1', 'evidence-artifact-2'],
      requirementIds: ['evidence-requirement-1'],
      satisfactionIds: ['evidence-satisfaction-1'],
      reviewIds: ['evidence-review-1'],
      citationIds: ['citation-1'],
      evidenceLinkIds: ['evidence-link-1'],
      proofHash: 'proof-hash-verbatim',
    });
    const item = mapEvidenceProofToItem(ctx, proof);

    assert.equal(item.type, 'evidence_proof');
    assert.equal(item.sourceModule, 'evidence_source_runtime');
    assert.equal(item.sourceId, proof.id);
    assert.deepEqual(item.payload.sourceDocumentIds, ['source-document-1', 'source-document-2']);
    assert.deepEqual(item.payload.evidenceArtifactIds, ['evidence-artifact-1', 'evidence-artifact-2']);
    assert.deepEqual(item.payload.requirementIds, ['evidence-requirement-1']);
    assert.deepEqual(item.payload.satisfactionIds, ['evidence-satisfaction-1']);
    assert.deepEqual(item.payload.reviewIds, ['evidence-review-1']);
    assert.deepEqual(item.payload.citationIds, ['citation-1']);
    assert.deepEqual(item.payload.evidenceLinkIds, ['evidence-link-1']);
    assert.equal(item.payload.proofHash, 'proof-hash-verbatim');
  });

  it('9. mapEvidenceEventToItem maps an EvidenceEvent to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const event = makeEvent();
    const item = mapEvidenceEventToItem(ctx, event);

    assert.equal(item.type, 'evidence_event');
    assert.equal(item.sourceModule, 'evidence_source_runtime');
    assert.equal(item.sourceId, event.id);
    assert.equal(item.payload.type, event.type);
  });
});
