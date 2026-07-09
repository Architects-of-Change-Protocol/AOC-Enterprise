import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateAocPMFreakRemoteGovernancePayloadSize } from '../aoc-pmfreak-remote-governance-payload-guard.js';
import { createAocPMFreakRemoteGovernanceEndpointConfig } from '../aoc-pmfreak-remote-governance-endpoint-config.js';

describe('AOC PMFreak Remote Governance Endpoint -- payload-size guard', () => {
  const config = createAocPMFreakRemoteGovernanceEndpointConfig({ maxPayloadSizeKb: 1 });

  it('allows a small body', () => {
    const result = validateAocPMFreakRemoteGovernancePayloadSize({ requestId: 'demo' }, config);
    assert.equal(result.valid, true);
  });

  it('rejects an oversized body with a safe payload_too_large error', () => {
    const result = validateAocPMFreakRemoteGovernancePayloadSize({ metadata: { blob: 'x'.repeat(4096) } }, config);
    assert.equal(result.valid, false);
    assert.equal(result.error?.code, 'payload_too_large');
    assert.equal(result.error?.safe, true);
  });

  it('is deterministic across repeated calls with the same body', () => {
    const body = { metadata: { blob: 'x'.repeat(4096) } };
    const first = validateAocPMFreakRemoteGovernancePayloadSize(body, config);
    const second = validateAocPMFreakRemoteGovernancePayloadSize(body, config);
    assert.deepEqual(first, second);
  });

  it('treats a non-serializable body as too large rather than throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = validateAocPMFreakRemoteGovernancePayloadSize(circular, config);
    assert.equal(result.valid, false);
    assert.equal(result.error?.code, 'payload_too_large');
  });
});
