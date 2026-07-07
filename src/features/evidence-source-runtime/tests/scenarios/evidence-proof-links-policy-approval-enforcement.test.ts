import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture } from '../../fixtures/evidence-demo.fixture.js';

/**
 * Story: one evidence proof links evidence to a policy decision, an
 * approval decision, and an enforcement decision.
 */
describe('Scenario: evidence proof links policy, approval, and enforcement', () => {
  function buildCombinedProof() {
    const world = buildEvidenceDemoFixture();
    const { runtime, invoiceEvidence, approvalMemoEvidence, eventRecordEvidence, invoiceToPolicyCitation, approvalMemoToApprovalCitation, eventRecordToEnforcementCitation } = world;

    const policyLink = runtime.linkEvidence({ type: 'referenced_by', evidenceArtifactId: invoiceEvidence.id, targetType: 'policy_decision', targetId: invoiceToPolicyCitation.targetId });
    const approvalLink = runtime.linkEvidence({ type: 'referenced_by', evidenceArtifactId: approvalMemoEvidence.id, targetType: 'approval_decision', targetId: approvalMemoToApprovalCitation.targetId });
    const enforcementLink = runtime.linkEvidence({ type: 'referenced_by', evidenceArtifactId: eventRecordEvidence.id, targetType: 'enforcement_decision', targetId: eventRecordToEnforcementCitation.targetId });

    const combinedProof = runtime.createEvidenceProof({
      trustDomainId: 'trust-domain-datasys-agent-republic',
      evidenceArtifactIds: [invoiceEvidence.id, approvalMemoEvidence.id, eventRecordEvidence.id],
      citationIds: [invoiceToPolicyCitation.id, approvalMemoToApprovalCitation.id, eventRecordToEnforcementCitation.id],
      evidenceLinkIds: [policyLink.id, approvalLink.id, enforcementLink.id],
    });

    return { world, combinedProof, citationIds: [invoiceToPolicyCitation.id, approvalMemoToApprovalCitation.id, eventRecordToEnforcementCitation.id] };
  }

  it('binds citations for all three decision types into one proof, deterministically', () => {
    const { world, combinedProof, citationIds } = buildCombinedProof();

    const citationsByTarget = {
      policy: world.runtime.citations.listByTarget('policy_decision', world.invoiceToPolicyCitation.targetId),
      approval: world.runtime.citations.listByTarget('approval_decision', world.approvalMemoToApprovalCitation.targetId),
      enforcement: world.runtime.citations.listByTarget('enforcement_decision', world.eventRecordToEnforcementCitation.targetId),
    };
    assert.equal(citationsByTarget.policy.length, 1);
    assert.equal(citationsByTarget.approval.length, 1);
    assert.equal(citationsByTarget.enforcement.length, 1);

    assert.equal(world.runtime.links.listByArtifact(world.invoiceEvidence.id).some((l) => l.targetType === 'policy_decision'), true);
    assert.equal(world.runtime.links.listByArtifact(world.approvalMemoEvidence.id).some((l) => l.targetType === 'approval_decision'), true);
    assert.equal(world.runtime.links.listByArtifact(world.eventRecordEvidence.id).some((l) => l.targetType === 'enforcement_decision'), true);

    assert.deepEqual([...combinedProof.citationIds].sort(), [...citationIds].sort());

    const again = buildCombinedProof();
    assert.equal(combinedProof.proofHash, again.combinedProof.proofHash);
  });
});
