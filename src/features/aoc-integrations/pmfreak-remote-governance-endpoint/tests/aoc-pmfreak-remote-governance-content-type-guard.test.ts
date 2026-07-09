import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateAocPMFreakRemoteGovernanceContentType } from '../aoc-pmfreak-remote-governance-content-type-guard.js';
import { createAocPMFreakRemoteGovernanceEndpointConfig } from '../aoc-pmfreak-remote-governance-endpoint-config.js';

describe('AOC PMFreak Remote Governance Endpoint -- content-type guard', () => {
  const config = createAocPMFreakRemoteGovernanceEndpointConfig();

  it('allows application/json', () => {
    const result = validateAocPMFreakRemoteGovernanceContentType({ 'content-type': 'application/json' }, config);
    assert.equal(result.valid, true);
  });

  it('allows application/json with a charset suffix', () => {
    const result = validateAocPMFreakRemoteGovernanceContentType({ 'content-type': 'application/json; charset=utf-8' }, config);
    assert.equal(result.valid, true);
  });

  it('is case-insensitive on the header name and value', () => {
    const result = validateAocPMFreakRemoteGovernanceContentType({ 'Content-Type': 'APPLICATION/JSON' }, config);
    assert.equal(result.valid, true);
  });

  it('rejects text/plain with a safe unsupported_content_type error', () => {
    const result = validateAocPMFreakRemoteGovernanceContentType({ 'content-type': 'text/plain' }, config);
    assert.equal(result.valid, false);
    assert.equal(result.error?.code, 'unsupported_content_type');
    assert.equal(result.error?.safe, true);
  });

  it('rejects a missing content-type header', () => {
    const result = validateAocPMFreakRemoteGovernanceContentType({}, config);
    assert.equal(result.valid, false);
    assert.equal(result.error?.code, 'unsupported_content_type');
  });
});
