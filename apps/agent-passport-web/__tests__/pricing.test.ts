import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTierByKey, isValidTierKey, AGENT_PASSPORT_TIERS } from '../src/lib/pricing';

describe('pricing', () => {
  it('AGENT_PASSPORT_TIERS has exactly 3 tiers', () => {
    assert.equal(AGENT_PASSPORT_TIERS.length, 3);
  });

  it('getTierByKey returns agent_passport_single', () => {
    const tier = getTierByKey('agent_passport_single');
    assert.ok(tier);
    assert.equal(tier.name, 'Agent Passport');
    assert.equal(tier.priceLabel, '$99');
  });

  it('getTierByKey returns governed_agent', () => {
    const tier = getTierByKey('governed_agent');
    assert.ok(tier);
    assert.equal(tier.name, 'Governed Agent');
    assert.equal(tier.priceLabel, '$299');
  });

  it('getTierByKey returns organization_agent_registry', () => {
    const tier = getTierByKey('organization_agent_registry');
    assert.ok(tier);
    assert.equal(tier.name, 'Organization Agent Registry');
    assert.equal(tier.priceLabel, '$999');
  });

  it('getTierByKey returns undefined for unknown key', () => {
    assert.equal(getTierByKey('unknown_tier'), undefined);
  });

  it('isValidTierKey returns true for valid keys', () => {
    assert.ok(isValidTierKey('agent_passport_single'));
    assert.ok(isValidTierKey('governed_agent'));
    assert.ok(isValidTierKey('organization_agent_registry'));
  });

  it('isValidTierKey returns false for invalid key', () => {
    assert.ok(!isValidTierKey('bad_tier'));
    assert.ok(!isValidTierKey(''));
    assert.ok(!isValidTierKey('AGENT_PASSPORT_SINGLE'));
  });
});
