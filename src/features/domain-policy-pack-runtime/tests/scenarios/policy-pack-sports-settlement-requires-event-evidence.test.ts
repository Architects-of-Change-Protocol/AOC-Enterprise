import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime } from '../../fixtures/domain-policy-pack-demo.fixture.js';
import { buildSettleEventPaymentInput } from '../../fixtures/sports-settlement-policy-demo.fixture.js';

describe('sports event settlement requires event record evidence', () => {
  it('1. settle_event_payment without evidence requires event_record evidence', () => {
    const runtime = buildDemoPolicyPackRuntime();

    const result = runtime.evaluatePolicy(buildSettleEventPaymentInput({ hasRequiredEvidence: false }));

    assert.equal(result.decision.type, 'requires_evidence');
    assert.ok(result.decision.evidenceRequirements.some((requirement) => requirement.type === 'event_record'));

    assert.ok(result.proof);
    assert.equal(result.decision.proofId, result.proof!.id);
  });
});
