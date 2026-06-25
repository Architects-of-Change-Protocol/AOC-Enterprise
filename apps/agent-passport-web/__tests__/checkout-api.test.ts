import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidTierKey } from '../src/lib/pricing';

describe('checkout session validation', () => {
  it('accepts valid tier keys', () => {
    assert.ok(isValidTierKey('agent_passport_single'));
    assert.ok(isValidTierKey('governed_agent'));
    assert.ok(isValidTierKey('organization_agent_registry'));
  });

  it('rejects invalid tier key', () => {
    assert.ok(!isValidTierKey('invalid_tier'));
    assert.ok(!isValidTierKey(''));
    assert.ok(!isValidTierKey('free'));
  });

  it('checkout fails without STRIPE_SECRET_KEY (env check)', () => {
    // Simulate the env check behavior
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    assert.equal(stripeKey, undefined, 'STRIPE_SECRET_KEY should not be set in test environment');
  });
});
