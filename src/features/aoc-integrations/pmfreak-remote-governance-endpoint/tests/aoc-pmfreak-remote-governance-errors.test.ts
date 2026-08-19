import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakRemoteGovernanceEndpointError } from '../aoc-pmfreak-remote-governance-errors.js';

describe('Soberanía PMFreak Remote Governance Endpoint -- error model', () => {
  it('builds a safe structured error', () => {
    const error = createAocPMFreakRemoteGovernanceEndpointError('invalid_request', 'Request body is malformed.');
    assert.equal(error.code, 'invalid_request');
    assert.equal(error.message, 'Request body is malformed.');
    assert.equal(error.safe, true);
    assert.equal(error.details, undefined);
  });

  it('includes details when provided', () => {
    const error = createAocPMFreakRemoteGovernanceEndpointError('invalid_method', 'Method not allowed.', { method: 'GET' });
    assert.deepEqual(error.details, { method: 'GET' });
  });

  it('never throws', () => {
    const error = createAocPMFreakRemoteGovernanceEndpointError('unknown_error', 'demo');
    assert.equal(error.code, 'unknown_error');
  });
});
