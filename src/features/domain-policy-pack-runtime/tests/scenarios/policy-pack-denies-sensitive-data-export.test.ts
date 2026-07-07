import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime } from '../../fixtures/domain-policy-pack-demo.fixture.js';
import { buildExportClientDataInput } from '../../fixtures/data-boundary-policy-demo.fixture.js';

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

describe('policy pack denies export of a prohibited/sensitive data domain', () => {
  it('1. export_client_data touching the classified data domain is denied', () => {
    const runtime = buildDemoPolicyPackRuntime();

    const result = runtime.evaluatePolicy(buildExportClientDataInput({ dataDomains: ['classified'] }));

    assert.equal(result.decision.type, 'denied');
    assert.equal(result.decision.allowed, false);

    const executed = simulateGatedExecution(result.decision.allowed);
    assert.equal(executed, false);

    assert.ok(result.proof);
    assert.equal(result.decision.proofId, result.proof!.id);
  });
});
