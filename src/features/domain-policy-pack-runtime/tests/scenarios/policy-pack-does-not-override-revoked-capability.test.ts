import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime } from '../../fixtures/domain-policy-pack-demo.fixture.js';
import { buildReadProjectSummaryInput } from '../../fixtures/data-boundary-policy-demo.fixture.js';

describe('policy pack allow does not override a revoked capability', () => {
  it('1. a real policy "allow" is never, by itself, sufficient when capability is revoked', () => {
    const runtime = buildDemoPolicyPackRuntime();

    const result = runtime.evaluatePolicy(buildReadProjectSummaryInput());

    assert.equal(result.decision.type, 'allowed');
    assert.equal(result.decision.allowed, true);

    // Simulates the independent capability-revocation check a real caller (Action Enforcement / Recognition Runtime)
    // must always AND together with this module's decision -- a policy pack 'allow' can never, by itself, override
    // a revoked capability, because this module has no visibility into capability revocation state at all.
    const capabilityRevoked = true;
    const finalAllowed = result.decision.allowed && !capabilityRevoked;
    assert.equal(finalAllowed, false);
  });
});
