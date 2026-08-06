import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENTERPRISE_GRANT_REVOCATION_REASONS } from '@aoc-enterprise/grant-revocation';
import { PINATA_PROVIDER_SYSTEM } from '../src/pinata-provider-adapter.js';
import { createPinataRevocationCapability, pinataRevocationSemanticsForReason } from '../src/pinata-revocation-capability.js';

describe('pinataRevocationSemanticsForReason', () => {
  it('maps resource-removed to resource_wide (the only reason files.public.delete is honest for)', () => {
    assert.equal(pinataRevocationSemanticsForReason(ENTERPRISE_GRANT_REVOCATION_REASONS.RESOURCE_REMOVED), 'resource_wide');
  });

  it('maps every other revocation reason to ttl_bounded -- Pinata cannot selectively invalidate an issued credential', () => {
    const nonResourceReasons = Object.values(ENTERPRISE_GRANT_REVOCATION_REASONS).filter((reason) => reason !== 'resource-removed');
    assert.ok(nonResourceReasons.length > 0);
    for (const reason of nonResourceReasons) {
      assert.equal(pinataRevocationSemanticsForReason(reason), 'ttl_bounded');
    }
  });
});

describe('createPinataRevocationCapability', () => {
  it('truthfully declares no selective invalidation of already-issued credentials', () => {
    const capability = createPinataRevocationCapability({ id: 'cap-1', declaredAt: '2026-08-06T00:00:00.000Z', correlationId: 'corr-1' });
    assert.equal(capability.providerSystem, PINATA_PROVIDER_SYSTEM);
    assert.equal(capability.supportsSelectiveInvalidationOfIssuedCredential, false);
    assert.equal(capability.supportsPreventionOfFutureIssuance, true);
    assert.equal(capability.supportsResourceWideInvalidation, true);
    assert.equal(capability.revocationSemanticsByReason['administrator-revoked'], 'ttl_bounded');
    assert.equal(capability.revocationSemanticsByReason['resource-removed'], 'resource_wide');
  });

  it('never fabricates a TTL bound it has not verified', () => {
    const capability = createPinataRevocationCapability({ id: 'cap-2', declaredAt: '2026-08-06T00:00:00.000Z', correlationId: 'corr-2' });
    assert.equal(capability.minRequestedDurationSeconds, null);
    assert.equal(capability.maxRequestedDurationSeconds, null);
  });
});
