import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakRemoteGovernanceEndpointHealth } from '../aoc-pmfreak-remote-governance-health.js';
import { createAocPMFreakRemoteGovernanceEndpointConfig } from '../aoc-pmfreak-remote-governance-endpoint-config.js';

describe('Soberanía PMFreak Remote Governance Endpoint -- health', () => {
  it('reports healthy for a default config', () => {
    const health = createAocPMFreakRemoteGovernanceEndpointHealth({ config: createAocPMFreakRemoteGovernanceEndpointConfig() });
    assert.equal(health.status, 'healthy');
    assert.deepEqual(health.warnings, []);
    assert.deepEqual(health.errors, []);
  });

  it('reports degraded when the config carries warnings', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ allowPMFreakMutations: true });
    const health = createAocPMFreakRemoteGovernanceEndpointHealth({ config });
    assert.equal(health.status, 'degraded');
    assert.ok(health.warnings.length > 0);
  });

  it('reports unavailable when the config is an unsafe production configuration', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ environment: 'production', authMode: 'none_demo' });
    const health = createAocPMFreakRemoteGovernanceEndpointHealth({ config });
    assert.equal(health.status, 'unavailable');
    assert.ok(health.errors.length > 0);
  });

  it('reports unavailable when explicit errors are passed in', () => {
    const health = createAocPMFreakRemoteGovernanceEndpointHealth({ config: createAocPMFreakRemoteGovernanceEndpointConfig(), errors: ['a demo error'] });
    assert.equal(health.status, 'unavailable');
  });

  it('never claims mutation/execution/invoice/communication capability', () => {
    const health = createAocPMFreakRemoteGovernanceEndpointHealth({ config: createAocPMFreakRemoteGovernanceEndpointConfig() });
    assert.equal(health.productionMutationCapable, false);
    assert.equal(health.pmfreakMutationCapable, false);
    assert.equal(health.actionExecutionCapable, false);
    assert.equal(health.invoiceCreationCapable, false);
    assert.equal(health.communicationCapable, false);
  });
});
