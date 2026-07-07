import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture, APPROVAL_DECISION_ID } from '../../fixtures/evidence-demo.fixture.js';

/**
 * Story: a human approval decision references an approval memo.
 */
describe('Scenario: approval memo evidence supports human approval', () => {
  it('registers the approval memo source, links evidence to the approval decision via a citation, and proves it', () => {
    const { runtime, approvalMemoSource, approvalMemoEvidence, approvalMemoToApprovalCitation, approvalDecisionProof } = buildEvidenceDemoFixture();

    assert.equal(runtime.sourceDocuments.get(approvalMemoSource.id)?.status, 'active');
    assert.equal(runtime.evidenceArtifacts.get(approvalMemoEvidence.id)?.status, 'accepted');

    assert.equal(approvalMemoToApprovalCitation.targetType, 'approval_decision');
    assert.equal(approvalMemoToApprovalCitation.targetId, APPROVAL_DECISION_ID);
    assert.equal(approvalMemoToApprovalCitation.evidenceArtifactId, approvalMemoEvidence.id);

    assert.equal(approvalDecisionProof.targetType, 'approval_decision');
    assert.equal(approvalDecisionProof.targetId, APPROVAL_DECISION_ID);
    assert.ok(approvalDecisionProof.evidenceArtifactIds.includes(approvalMemoEvidence.id));
    assert.ok(approvalDecisionProof.citationIds.includes(approvalMemoToApprovalCitation.id));
  });
});
