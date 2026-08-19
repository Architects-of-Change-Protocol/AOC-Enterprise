import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateAocPMFreakRemoteGovernanceAuth } from '../aoc-pmfreak-remote-governance-auth-guard.js';
import { createAocPMFreakRemoteGovernanceEndpointConfig } from '../aoc-pmfreak-remote-governance-endpoint-config.js';

describe('Soberanía PMFreak Remote Governance Endpoint -- auth guard', () => {
  it('allows none_demo outside production', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ environment: 'demo', authMode: 'none_demo' });
    const result = validateAocPMFreakRemoteGovernanceAuth({}, config);
    assert.equal(result.valid, true);
  });

  it('rejects none_demo in production safely', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ environment: 'production', authMode: 'none_demo' });
    const result = validateAocPMFreakRemoteGovernanceAuth({}, config);
    assert.equal(result.valid, false);
    assert.equal(result.error?.code, 'unsafe_production_config');
    assert.equal(result.error?.safe, true);
  });

  it('rejects an unsupported auth mode safely', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ environment: 'staging', authMode: 'unsupported' });
    const result = validateAocPMFreakRemoteGovernanceAuth({}, config);
    assert.equal(result.valid, false);
    assert.equal(result.error?.code, 'auth_failed');
  });

  describe('shared_secret_header', () => {
    it('allows a correct header value', () => {
      const config = createAocPMFreakRemoteGovernanceEndpointConfig({ authMode: 'shared_secret_header', sharedSecretValue: 'demo-correct-secret' });
      const result = validateAocPMFreakRemoteGovernanceAuth({ 'x-aoc-governance-secret': 'demo-correct-secret' }, config);
      assert.equal(result.valid, true);
    });

    it('is case-insensitive on the header name', () => {
      const config = createAocPMFreakRemoteGovernanceEndpointConfig({ authMode: 'shared_secret_header', sharedSecretValue: 'demo-correct-secret' });
      const result = validateAocPMFreakRemoteGovernanceAuth({ 'X-AOC-Governance-Secret': 'demo-correct-secret' }, config);
      assert.equal(result.valid, true);
    });

    it('honors a custom configured header name', () => {
      const config = createAocPMFreakRemoteGovernanceEndpointConfig({ authMode: 'shared_secret_header', sharedSecretHeaderName: 'x-custom-secret', sharedSecretValue: 'demo-correct-secret' });
      const result = validateAocPMFreakRemoteGovernanceAuth({ 'x-custom-secret': 'demo-correct-secret' }, config);
      assert.equal(result.valid, true);
    });

    it('rejects a missing header without leaking the configured secret', () => {
      const config = createAocPMFreakRemoteGovernanceEndpointConfig({ authMode: 'shared_secret_header', sharedSecretValue: 'demo-correct-secret' });
      const result = validateAocPMFreakRemoteGovernanceAuth({}, config);

      assert.equal(result.valid, false);
      assert.equal(result.error?.code, 'auth_required');
      assert.ok(!JSON.stringify(result.error).includes('demo-correct-secret'));
    });

    it('rejects an incorrect header value without leaking either secret', () => {
      const config = createAocPMFreakRemoteGovernanceEndpointConfig({ authMode: 'shared_secret_header', sharedSecretValue: 'demo-correct-secret' });
      const result = validateAocPMFreakRemoteGovernanceAuth({ 'x-aoc-governance-secret': 'demo-wrong-secret' }, config);

      assert.equal(result.valid, false);
      assert.equal(result.error?.code, 'auth_failed');
      assert.ok(!JSON.stringify(result.error).includes('demo-correct-secret'));
      assert.ok(!JSON.stringify(result.error).includes('demo-wrong-secret'));
    });

    it('rejects safely when no secret value is configured at all', () => {
      const config = createAocPMFreakRemoteGovernanceEndpointConfig({ authMode: 'shared_secret_header' });
      const result = validateAocPMFreakRemoteGovernanceAuth({ 'x-aoc-governance-secret': 'anything' }, config);

      assert.equal(result.valid, false);
      assert.equal(result.error?.code, 'auth_required');
    });
  });
});
