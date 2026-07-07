import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture, POLICY_DECISION_ID } from '../../fixtures/evidence-demo.fixture.js';

/**
 * Story: Policy pack requires invoice evidence. Invoice source document and
 * evidence artifact exist. Evidence satisfies requirement.
 */
describe('Scenario: invoice evidence satisfies policy requirement', () => {
  it('registers the source document, accepts the evidence artifact, satisfies the requirement, proves it, and cites it', () => {
    const { runtime, invoiceSource, invoiceEvidence, invoiceRequirement, invoiceSatisfaction, invoiceToPolicyCitation, policyDecisionProof } = buildEvidenceDemoFixture();

    assert.equal(runtime.sourceDocuments.get(invoiceSource.id)?.status, 'active');

    assert.equal(runtime.evidenceArtifacts.get(invoiceEvidence.id)?.status, 'accepted');

    assert.equal(invoiceRequirement.source, 'policy_pack');
    assert.equal(invoiceRequirement.policyDecisionId, POLICY_DECISION_ID);
    assert.equal(runtime.requirements.get(invoiceRequirement.id)?.status, 'satisfied');

    assert.equal(invoiceSatisfaction.status, 'satisfied');
    assert.deepEqual(invoiceSatisfaction.evidenceArtifactIds, [invoiceEvidence.id]);

    assert.equal(policyDecisionProof.targetType, 'policy_decision');
    assert.equal(policyDecisionProof.targetId, POLICY_DECISION_ID);
    assert.ok(policyDecisionProof.evidenceArtifactIds.includes(invoiceEvidence.id));

    assert.equal(invoiceToPolicyCitation.targetType, 'policy_decision');
    assert.equal(invoiceToPolicyCitation.evidenceArtifactId, invoiceEvidence.id);

    const validation = runtime.validateEvidenceForTarget({ requirementIds: [invoiceRequirement.id], targetType: 'policy_decision', targetId: POLICY_DECISION_ID });
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.missingRequirementIds, []);
  });
});
