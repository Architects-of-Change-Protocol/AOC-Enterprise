import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceStore } from '../services/evidence-store.js';
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

const NOW = '2026-01-01T00:00:00.000Z';

function buildSourceDocument(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: 'source-document-1',
    type: 'invoice',
    title: 'Invoice',
    status: 'active',
    authority: 'customer_provided',
    metadataHash: 'hash-1',
    trustDomainId: 'trust-domain-1',
    demoOnly: true,
    legalCompleteness: 'customer_provided',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildArtifact(overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  return {
    id: 'evidence-artifact-1',
    type: 'invoice',
    title: 'Invoice evidence',
    status: 'submitted',
    trustDomainId: 'trust-domain-1',
    submittedByActorId: 'actor-1',
    submittedAt: NOW,
    metadataHash: 'hash-1',
    tags: [],
    ...overrides,
  };
}

function buildRequirement(overrides: Partial<EvidenceRequirement> = {}): EvidenceRequirement {
  return {
    id: 'evidence-requirement-1',
    type: 'invoice',
    source: 'manual',
    trustDomainId: 'trust-domain-1',
    description: 'Attach invoice.',
    required: true,
    status: 'open',
    createdAt: NOW,
    ...overrides,
  };
}

function buildSatisfaction(overrides: Partial<EvidenceSatisfaction> = {}): EvidenceSatisfaction {
  return {
    id: 'evidence-satisfaction-1',
    requirementId: 'evidence-requirement-1',
    evidenceArtifactIds: ['evidence-artifact-1'],
    status: 'satisfied',
    satisfiedAt: NOW,
    reasonCode: 'OK',
    reason: 'attached',
    ...overrides,
  };
}

function buildReview(overrides: Partial<EvidenceReview> = {}): EvidenceReview {
  return {
    id: 'evidence-review-1',
    reviewerActorId: 'actor-2',
    decision: 'accepted',
    reasonCode: 'OK',
    reason: 'looks good',
    reviewedAt: NOW,
    ...overrides,
  };
}

function buildCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    id: 'citation-1',
    targetType: 'policy_decision',
    targetId: 'policy-decision-1',
    citationText: 'cited',
    reasonCode: 'OK',
    reason: 'cited for support',
    createdAt: NOW,
    ...overrides,
  };
}

function buildAnchor(overrides: Partial<CitationAnchor> = {}): CitationAnchor {
  return {
    id: 'citation-anchor-1',
    sourceDocumentId: 'source-document-1',
    type: 'document',
    label: 'whole document',
    ...overrides,
  };
}

function buildLink(overrides: Partial<EvidenceLink> = {}): EvidenceLink {
  return {
    id: 'evidence-link-1',
    type: 'supports',
    evidenceArtifactId: 'evidence-artifact-1',
    targetType: 'policy_decision',
    targetId: 'policy-decision-1',
    createdAt: NOW,
    ...overrides,
  };
}

function buildProof(overrides: Partial<EvidenceProof> = {}): EvidenceProof {
  return {
    id: 'evidence-proof-1',
    trustDomainId: 'trust-domain-1',
    sourceDocumentIds: [],
    evidenceArtifactIds: [],
    requirementIds: [],
    satisfactionIds: [],
    reviewIds: [],
    citationIds: [],
    evidenceLinkIds: [],
    sourceHash: 'h',
    evidenceHash: 'h',
    requirementHash: 'h',
    satisfactionHash: 'h',
    reviewHash: 'h',
    citationHash: 'h',
    linkHash: 'h',
    proofHash: 'h',
    createdAt: NOW,
    ...overrides,
  };
}

function buildEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    id: 'evidence-event-1',
    type: 'source_document_registered',
    timestamp: NOW,
    payload: {},
    eventHash: 'h',
    ...overrides,
  };
}

describe('EvidenceStore', () => {
  it('1. stores and retrieves SourceDocument', () => {
    const store = new EvidenceStore();
    const document = buildSourceDocument();
    store.saveSourceDocument(document);
    assert.deepEqual(store.getSourceDocument(document.id), document);
  });

  it('2. stores and retrieves EvidenceArtifact', () => {
    const store = new EvidenceStore();
    const artifact = buildArtifact();
    store.saveEvidenceArtifact(artifact);
    assert.deepEqual(store.getEvidenceArtifact(artifact.id), artifact);
  });

  it('3. stores and retrieves EvidenceRequirement', () => {
    const store = new EvidenceStore();
    const requirement = buildRequirement();
    store.saveRequirement(requirement);
    assert.deepEqual(store.getRequirement(requirement.id), requirement);
  });

  it('4. stores and retrieves EvidenceSatisfaction', () => {
    const store = new EvidenceStore();
    const satisfaction = buildSatisfaction();
    store.saveSatisfaction(satisfaction);
    assert.deepEqual(store.getSatisfaction(satisfaction.id), satisfaction);
  });

  it('5. stores and retrieves EvidenceReview', () => {
    const store = new EvidenceStore();
    const review = buildReview();
    store.saveReview(review);
    assert.deepEqual(store.getReview(review.id), review);
  });

  it('6. stores and retrieves Citation', () => {
    const store = new EvidenceStore();
    const citation = buildCitation();
    store.saveCitation(citation);
    assert.deepEqual(store.getCitation(citation.id), citation);
  });

  it('7. stores and retrieves CitationAnchor', () => {
    const store = new EvidenceStore();
    const anchor = buildAnchor();
    store.saveCitationAnchor(anchor);
    assert.deepEqual(store.getCitationAnchor(anchor.id), anchor);
  });

  it('8. stores and retrieves EvidenceLink', () => {
    const store = new EvidenceStore();
    const link = buildLink();
    store.saveEvidenceLink(link);
    assert.deepEqual(store.getEvidenceLink(link.id), link);
  });

  it('9. stores and retrieves EvidenceProof', () => {
    const store = new EvidenceStore();
    const proof = buildProof();
    store.saveProof(proof);
    assert.deepEqual(store.getProof(proof.id), proof);
  });

  it('10. stores and retrieves EvidenceEvent', () => {
    const store = new EvidenceStore();
    const event = buildEvent();
    store.saveEvent(event);
    assert.deepEqual(store.getEvents(), [event]);
  });

  it('11. queries by trustDomainId', () => {
    const store = new EvidenceStore();
    store.saveSourceDocument(buildSourceDocument({ id: 'a', trustDomainId: 'domain-a' }));
    store.saveSourceDocument(buildSourceDocument({ id: 'b', trustDomainId: 'domain-b' }));
    assert.deepEqual(
      store.listSourceDocumentsByTrustDomain('domain-a').map((d) => d.id),
      ['a'],
    );
  });

  it('12. queries evidence by target (via satisfactions by requirement)', () => {
    const store = new EvidenceStore();
    store.saveSatisfaction(buildSatisfaction({ id: 's1', requirementId: 'r1' }));
    store.saveSatisfaction(buildSatisfaction({ id: 's2', requirementId: 'r2' }));
    assert.deepEqual(
      store.listSatisfactionsByRequirement('r1').map((s) => s.id),
      ['s1'],
    );
  });

  it('13. queries citations by target', () => {
    const store = new EvidenceStore();
    store.saveCitation(buildCitation({ id: 'c1', targetType: 'policy_decision', targetId: 'p1' }));
    store.saveCitation(buildCitation({ id: 'c2', targetType: 'approval_decision', targetId: 'p1' }));
    assert.deepEqual(
      store.listCitationsByTarget('policy_decision', 'p1').map((c) => c.id),
      ['c1'],
    );
  });

  it('14. queries links by evidenceArtifactId', () => {
    const store = new EvidenceStore();
    store.saveEvidenceLink(buildLink({ id: 'l1', evidenceArtifactId: 'artifact-1' }));
    store.saveEvidenceLink(buildLink({ id: 'l2', evidenceArtifactId: 'artifact-2' }));
    assert.deepEqual(
      store.listEvidenceLinksByArtifact('artifact-1').map((l) => l.id),
      ['l1'],
    );
  });

  it('15. queries satisfactions by requirementId', () => {
    const store = new EvidenceStore();
    store.saveSatisfaction(buildSatisfaction({ id: 's1', requirementId: 'r1' }));
    store.saveSatisfaction(buildSatisfaction({ id: 's2', requirementId: 'r1' }));
    assert.deepEqual(
      store.listSatisfactionsByRequirement('r1').map((s) => s.id),
      ['s1', 's2'],
    );
  });

  it('16. queries proofs by target', () => {
    const store = new EvidenceStore();
    store.saveProof(buildProof({ id: 'p1', targetType: 'policy_decision', targetId: 'x' }));
    store.saveProof(buildProof({ id: 'p2', targetType: 'approval_decision', targetId: 'x' }));
    assert.deepEqual(
      store.listProofsByTarget('policy_decision', 'x').map((p) => p.id),
      ['p1'],
    );
  });

  it('17. preserves deterministic ordering', () => {
    const store = new EvidenceStore();
    store.saveSourceDocument(buildSourceDocument({ id: 'z' }));
    store.saveSourceDocument(buildSourceDocument({ id: 'a' }));
    store.saveSourceDocument(buildSourceDocument({ id: 'm' }));
    assert.deepEqual(
      store.listSourceDocuments().map((d) => d.id),
      ['a', 'm', 'z'],
    );
  });

  it('18. updates statuses', () => {
    const store = new EvidenceStore();
    store.saveSourceDocument(buildSourceDocument({ id: 'doc-1', status: 'active' }));
    const updated = store.updateSourceDocumentStatus('doc-1', 'revoked', '2026-02-01T00:00:00.000Z');
    assert.equal(updated?.status, 'revoked');

    store.saveEvidenceArtifact(buildArtifact({ id: 'artifact-1', status: 'submitted' }));
    const updatedArtifact = store.updateEvidenceArtifactStatus('artifact-1', 'accepted');
    assert.equal(updatedArtifact?.status, 'accepted');

    store.saveRequirement(buildRequirement({ id: 'req-1', status: 'open' }));
    const updatedRequirement = store.updateRequirement('req-1', { status: 'satisfied' });
    assert.equal(updatedRequirement?.status, 'satisfied');
  });
});
