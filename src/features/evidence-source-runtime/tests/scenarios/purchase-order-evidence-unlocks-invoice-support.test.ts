import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture } from '../../fixtures/evidence-demo.fixture.js';

/**
 * Story: `prepare_invoice_support` was blocked by Action Enforcement for
 * missing invoice/PO evidence. Purchase order evidence is submitted and
 * satisfies the requirement.
 */
describe('Scenario: purchase order evidence unlocks invoice support', () => {
  it('starts open, becomes satisfied once purchase order evidence is attached, and never itself re-authorizes execution', () => {
    const { runtime, purchaseOrderRequirement, purchaseOrderEvidence } = buildEvidenceDemoFixture();

    assert.equal(purchaseOrderRequirement.status, 'open');
    const before = runtime.validateEvidenceForTarget({ requirementIds: [purchaseOrderRequirement.id] });
    assert.equal(before.valid, false);
    assert.deepEqual(before.missingRequirementIds, [purchaseOrderRequirement.id]);

    assert.equal(runtime.evidenceArtifacts.get(purchaseOrderEvidence.id)?.status, 'accepted');

    const satisfaction = runtime.satisfyEvidenceRequirement({
      requirementId: purchaseOrderRequirement.id,
      evidenceArtifactIds: [purchaseOrderEvidence.id],
      reasonCode: 'PO_ATTACHED',
      reason: 'Purchase order PO-2001 attached and accepted.',
      createProof: true,
    });
    assert.equal(satisfaction.status, 'satisfied');
    assert.ok(satisfaction.proofId !== undefined);

    const after = runtime.validateEvidenceForTarget({ requirementIds: [purchaseOrderRequirement.id] });
    assert.equal(after.valid, true);
    assert.equal(runtime.requirements.get(purchaseOrderRequirement.id)?.status, 'satisfied');

    // Evidence satisfaction never represents, mutates, or overrides an EnforcementDecision --
    // the runtime exposes no enforcement-decision type or API. A host consuming this evidence
    // must rerun Action Enforcement itself to translate satisfaction into an allow.
    assert.equal(typeof (runtime as unknown as { allowExecution?: unknown }).allowExecution, 'undefined');
  });
});
