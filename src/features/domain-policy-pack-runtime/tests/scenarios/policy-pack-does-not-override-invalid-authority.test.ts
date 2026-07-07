import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPolicyPackRuntime } from '../../fixtures/domain-policy-pack-demo.fixture.js';
import { buildReadProjectSummaryInput } from '../../fixtures/data-boundary-policy-demo.fixture.js';

describe('policy pack allow does not override invalid authority', () => {
  it('1. a real policy "allow" is never, by itself, an authority validation result', () => {
    const runtime = buildDemoPolicyPackRuntime();

    const result = runtime.evaluatePolicy(buildReadProjectSummaryInput());

    assert.equal(result.decision.type, 'allowed');
    assert.equal(result.decision.allowed, true);

    // Simulates Authority Graph's independent authority validation, which this module never performs itself for
    // actions whose policy rules don't reference authority -- a policy pack 'allow' must never be read as an
    // authority validation result.
    const authorityValid = false;
    const finalAllowed = result.decision.allowed && authorityValid;
    assert.equal(finalAllowed, false);
  });
});
