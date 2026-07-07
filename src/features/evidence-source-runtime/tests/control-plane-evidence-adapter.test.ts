import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture } from '../fixtures/evidence-demo.fixture.js';
import {
  buildEvidenceControlPlaneViewModel,
  toSourceDocumentRow,
  toEvidenceArtifactRow,
  toEvidenceRequirementRow,
  toEvidenceSatisfactionRow,
  toEvidenceReviewRow,
  toCitationRow,
  toEvidenceLinkRow,
  toEvidenceProofRow,
  toEvidenceEventRow,
} from '../integrations/control-plane-evidence-adapter.js';

describe('ControlPlaneEvidenceAdapter', () => {
  it('1. maps SourceDocumentRow', () => {
    const { invoiceSource } = buildEvidenceDemoFixture();
    const row = toSourceDocumentRow(invoiceSource);
    assert.equal(row.id, invoiceSource.id);
    assert.equal(row.metadataHash, invoiceSource.metadataHash);
  });

  it('2. maps EvidenceArtifactRow', () => {
    const { invoiceEvidence } = buildEvidenceDemoFixture();
    const row = toEvidenceArtifactRow(invoiceEvidence);
    assert.equal(row.id, invoiceEvidence.id);
    assert.equal(row.status, invoiceEvidence.status);
  });

  it('3. maps EvidenceRequirementRow', () => {
    const { invoiceRequirement } = buildEvidenceDemoFixture();
    const row = toEvidenceRequirementRow(invoiceRequirement);
    assert.equal(row.id, invoiceRequirement.id);
    assert.equal(row.policyDecisionId, invoiceRequirement.policyDecisionId);
  });

  it('4. maps EvidenceSatisfactionRow', () => {
    const { invoiceSatisfaction } = buildEvidenceDemoFixture();
    const row = toEvidenceSatisfactionRow(invoiceSatisfaction);
    assert.equal(row.id, invoiceSatisfaction.id);
    assert.equal(row.status, invoiceSatisfaction.status);
  });

  it('5. maps EvidenceReviewRow', () => {
    const { runtime } = buildEvidenceDemoFixture();
    const artifact = runtime.submitEvidenceArtifact({ id: 'ea-review-1', type: 'invoice', title: 'Invoice', trustDomainId: 'd', submittedByActorId: 'actor-1' });
    const review = runtime.reviewEvidence({ evidenceArtifactId: artifact.id, reviewerActorId: 'actor-reviewer', decision: 'accepted', reasonCode: 'OK', reason: 'ok' });
    const row = toEvidenceReviewRow(review);
    assert.equal(row.id, review.id);
    assert.equal(row.decision, 'accepted');
  });

  it('6. maps CitationRow', () => {
    const { invoiceToPolicyCitation } = buildEvidenceDemoFixture();
    const row = toCitationRow(invoiceToPolicyCitation);
    assert.equal(row.id, invoiceToPolicyCitation.id);
    assert.equal(row.targetType, 'policy_decision');
  });

  it('7. maps EvidenceLinkRow', () => {
    const { runtime, invoiceEvidence } = buildEvidenceDemoFixture();
    const [link] = runtime.links.listByArtifact(invoiceEvidence.id);
    if (!link) throw new Error('expected at least one link');
    const row = toEvidenceLinkRow(link);
    assert.equal(row.id, link.id);
  });

  it('8. maps EvidenceProofRow', () => {
    const { policyDecisionProof } = buildEvidenceDemoFixture();
    const row = toEvidenceProofRow(policyDecisionProof);
    assert.equal(row.id, policyDecisionProof.id);
    assert.equal(row.proofHash, policyDecisionProof.proofHash);
  });

  it('9. maps EvidenceEventRow', () => {
    const { runtime } = buildEvidenceDemoFixture();
    const [event] = runtime.ledger.getEvents();
    if (!event) throw new Error('expected at least one event');
    const row = toEvidenceEventRow(event);
    assert.equal(row.id, event.id);
    assert.ok(row.summary.length > 0);
  });

  it('10. deterministic output', () => {
    const a = buildEvidenceDemoFixture();
    const b = buildEvidenceDemoFixture();
    const viewModelA = buildEvidenceControlPlaneViewModel(a.runtime);
    const viewModelB = buildEvidenceControlPlaneViewModel(b.runtime);
    assert.deepEqual(viewModelA, viewModelB);
  });
});
