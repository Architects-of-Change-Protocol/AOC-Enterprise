import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture } from '../../fixtures/evidence-demo.fixture.js';

/**
 * Story: a rejected invoice artifact is attached to a requirement.
 */
describe('Scenario: rejected evidence does not satisfy requirement', () => {
  it('leaves the requirement unsatisfied and the validation reflects the rejection', () => {
    const { runtime, rejectedInvoiceEvidence } = buildEvidenceDemoFixture();

    assert.equal(runtime.evidenceArtifacts.get(rejectedInvoiceEvidence.id)?.status, 'rejected');

    const requirement = runtime.createEvidenceRequirement({
      type: 'invoice',
      source: 'manual',
      trustDomainId: 'trust-domain-datasys-agent-republic',
      description: 'A second invoice requirement for the duplicate submission attempt.',
      required: true,
    });

    const satisfaction = runtime.satisfyEvidenceRequirement({
      requirementId: requirement.id,
      evidenceArtifactIds: [rejectedInvoiceEvidence.id],
      reasonCode: 'INVOICE_ATTACHED',
      reason: 'Attempted to attach the rejected duplicate invoice.',
    });

    assert.equal(satisfaction.status, 'rejected');
    assert.equal(runtime.requirements.get(requirement.id)?.status, 'open');

    const validation = runtime.validateEvidenceForTarget({ requirementIds: [requirement.id] });
    assert.equal(validation.valid, false);
    assert.deepEqual(validation.rejectedEvidenceArtifactIds, [rejectedInvoiceEvidence.id]);
    assert.deepEqual(validation.satisfiedRequirementIds, []);
    assert.equal(validation.reasonCode, 'EVIDENCE_REJECTED');
  });
});
