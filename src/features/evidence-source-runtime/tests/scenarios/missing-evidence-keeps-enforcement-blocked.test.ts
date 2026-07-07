import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceDemoFixture } from '../../fixtures/evidence-demo.fixture.js';

/**
 * Story: an evidence requirement exists, but no accepted artifact satisfies
 * it yet.
 */
describe('Scenario: missing evidence keeps enforcement blocked', () => {
  it('reports invalid with the requirement in missingRequirementIds, and never fabricates a satisfaction', () => {
    const { runtime, purchaseOrderRequirement, dataClassificationRequirement } = buildEvidenceDemoFixture();

    assert.equal(purchaseOrderRequirement.status, 'open');
    assert.equal(dataClassificationRequirement.status, 'open');
    assert.equal(runtime.store.listSatisfactionsByRequirement(purchaseOrderRequirement.id).length, 0);

    const validation = runtime.validateEvidenceForTarget({
      requirementIds: [purchaseOrderRequirement.id, dataClassificationRequirement.id],
    });

    assert.equal(validation.valid, false);
    assert.deepEqual(
      [...validation.missingRequirementIds].sort(),
      [purchaseOrderRequirement.id, dataClassificationRequirement.id].sort(),
    );
    assert.deepEqual(validation.satisfiedRequirementIds, []);
    assert.equal(validation.reasonCode, 'EVIDENCE_MISSING');

    // No execution unlock occurs -- this runtime never exposes anything resembling an allow/execute API.
    assert.equal(typeof (runtime as unknown as { allowExecution?: unknown }).allowExecution, 'undefined');
  });
});
