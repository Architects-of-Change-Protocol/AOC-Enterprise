import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture } from '../../../evidence-source-runtime/fixtures/evidence-demo.fixture.js';
import { summarizeEvidenceForPilot, sourceDocumentClaimsValidation } from '../../integrations/evidence-pilot-adapter.js';

describe('evidence-pilot-adapter', () => {
  it('1. maps evidence sources', () => {
    const fixture = buildEvidenceDemoFixture();
    const summary = summarizeEvidenceForPilot([fixture.invoiceSource], [fixture.invoiceEvidence], [fixture.invoiceRequirement], fixture.policyDecisionProof);
    assert.deepEqual(summary.sourceDocumentIds, [fixture.invoiceSource.id]);
  });

  it('2. maps evidence artifacts', () => {
    const fixture = buildEvidenceDemoFixture();
    const summary = summarizeEvidenceForPilot([fixture.invoiceSource], [fixture.invoiceEvidence], [fixture.invoiceRequirement], fixture.policyDecisionProof);
    assert.deepEqual(summary.evidenceArtifactIds, [fixture.invoiceEvidence.id]);
    assert.equal(summary.evidenceArtifactStatuses[fixture.invoiceEvidence.id], fixture.invoiceEvidence.status);
  });

  it('3. maps evidence requirements', () => {
    const fixture = buildEvidenceDemoFixture();
    const summary = summarizeEvidenceForPilot([], [], [fixture.invoiceRequirement, fixture.eventRecordRequirement]);
    assert.deepEqual(summary.requirementIds, [fixture.invoiceRequirement.id, fixture.eventRecordRequirement.id]);
  });

  it('4. maps evidence proofs', () => {
    const fixture = buildEvidenceDemoFixture();
    const summary = summarizeEvidenceForPilot([], [], [], fixture.policyDecisionProof);
    assert.equal(summary.proofId, fixture.policyDecisionProof.id);
    assert.equal(summary.proofHash, fixture.policyDecisionProof.proofHash);
  });

  it('5. preserves status', () => {
    const fixture = buildEvidenceDemoFixture();
    // fixture.rejectedInvoiceEvidence is the pre-reject snapshot returned by
    // submitEvidenceArtifact(); the runtime's own store holds the current,
    // post-reject record -- summarizeEvidenceForPilot must reflect whatever
    // artifact object it is actually given, verbatim.
    const currentRejected = fixture.runtime.evidenceArtifacts.get(fixture.rejectedInvoiceEvidence.id);
    if (currentRejected === undefined) {
      throw new Error('Expected the rejected invoice evidence artifact to still exist.');
    }
    assert.equal(currentRejected.status, 'rejected');
    const summary = summarizeEvidenceForPilot([], [currentRejected], [fixture.invoiceRequirement]);
    assert.equal(summary.evidenceArtifactStatuses[currentRejected.id], 'rejected');
    assert.equal(summary.requirementStatuses[fixture.invoiceRequirement.id], fixture.invoiceRequirement.status);
  });

  it('6. does not infer legal sufficiency', () => {
    const fixture = buildEvidenceDemoFixture();
    assert.equal(sourceDocumentClaimsValidation(fixture.invoiceSource), false);
    assert.equal(sourceDocumentClaimsValidation(fixture.customerPolicySource), false);
  });
});
