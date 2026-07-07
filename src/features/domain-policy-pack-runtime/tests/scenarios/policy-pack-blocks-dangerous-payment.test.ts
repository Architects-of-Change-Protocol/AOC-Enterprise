import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime } from '../../fixtures/domain-policy-pack-demo.fixture.js';
import { buildChangeBankAccountInput } from '../../fixtures/payments-policy-demo.fixture.js';

/**
 * Simulates the gating a real Action Enforcement caller must perform: it
 * must only execute the underlying action when the policy decision allows
 * it. This does not claim Action Enforcement itself was invoked.
 */
function simulateGatedExecution(allowed: boolean): boolean {
  let executed = false;
  if (allowed) {
    executed = true;
  }
  return executed;
}

describe('policy pack blocks a dangerous payment action', () => {
  it('1. change_bank_account is denied by default under the payments-basic demo policy', () => {
    const runtime = buildDemoPolicyPackRuntime();

    const result = runtime.evaluatePolicy(buildChangeBankAccountInput());

    assert.equal(result.decision.type, 'denied');
    assert.equal(result.decision.allowed, false);

    const executed = simulateGatedExecution(result.decision.allowed);
    assert.equal(executed, false);

    assert.ok(result.proof);
    assert.equal(typeof result.proof!.proofHash, 'string');
    assert.ok(result.proof!.proofHash.length > 0);
    assert.equal(result.decision.proofId, result.proof!.id);
  });
});
