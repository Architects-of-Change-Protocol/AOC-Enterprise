import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime } from '../../fixtures/domain-policy-pack-demo.fixture.js';
import { buildPrepareInvoiceSupportInput } from '../../fixtures/procurement-policy-demo.fixture.js';

describe('policy pack requires contract/purchase-order evidence', () => {
  it('1. prepare_invoice_support without evidence requires purchase order evidence', () => {
    const runtime = buildDemoPolicyPackRuntime();

    const result = runtime.evaluatePolicy(buildPrepareInvoiceSupportInput({ hasRequiredEvidence: false }));

    assert.equal(result.decision.type, 'requires_evidence');
    assert.ok(result.decision.evidenceRequirements.length > 0);

    assert.ok(result.proof);
    assert.equal(result.decision.proofId, result.proof!.id);
  });
});
