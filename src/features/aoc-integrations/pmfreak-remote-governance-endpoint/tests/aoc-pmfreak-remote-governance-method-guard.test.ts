import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateAocPMFreakRemoteGovernanceMethod } from '../aoc-pmfreak-remote-governance-method-guard.js';
import { createAocPMFreakRemoteGovernanceEndpointConfig } from '../aoc-pmfreak-remote-governance-endpoint-config.js';

describe('Soberanía PMFreak Remote Governance Endpoint -- method guard', () => {
  const config = createAocPMFreakRemoteGovernanceEndpointConfig();

  it('allows POST', () => {
    const result = validateAocPMFreakRemoteGovernanceMethod('POST', config);
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  it('allows lower-case post', () => {
    const result = validateAocPMFreakRemoteGovernanceMethod('post', config);
    assert.equal(result.valid, true);
  });

  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    it(`rejects ${method} with a safe invalid_method error`, () => {
      const result = validateAocPMFreakRemoteGovernanceMethod(method, config);
      assert.equal(result.valid, false);
      assert.equal(result.error?.code, 'invalid_method');
      assert.equal(result.error?.safe, true);
    });
  }
});
