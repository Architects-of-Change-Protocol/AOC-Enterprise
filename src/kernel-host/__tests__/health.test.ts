import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeRuntimeHealth } from '../health/health-check.js';
import { loadRuntimeConfiguration } from '../configuration/runtime-configuration.js';
import { createInMemoryGovernanceStore } from '../persistence/in-memory-governance-store.js';
import type { GovernanceStore } from '../persistence/governance-store.js';

describe('computeRuntimeHealth', () => {
  it('reports healthy when the store is reachable', async () => {
    const report = await computeRuntimeHealth({
      configuration: loadRuntimeConfiguration({}),
      store: createInMemoryGovernanceStore(),
      hasPolicyPackProvider: false,
      eventPublishingEnabled: true,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    assert.equal(report.status, 'healthy');
    assert.equal(report.database.provider, 'memory');
    assert.equal(report.database.connected, true);
    assert.equal(report.kernelVersion, '1.0.0');
    assert.equal(report.checkedAt, '2026-01-01T00:00:00.000Z');
  });

  it('reports unhealthy when the store cannot be reached', async () => {
    const unreachableStore: GovernanceStore = {
      ...createInMemoryGovernanceStore(),
      checkConnectivity: async () => false,
    };

    const report = await computeRuntimeHealth({
      configuration: loadRuntimeConfiguration({}),
      store: unreachableStore,
      hasPolicyPackProvider: false,
      eventPublishingEnabled: true,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    assert.equal(report.status, 'unhealthy');
    assert.equal(report.database.connected, false);
  });

  it('reflects whether a policy pack provider was configured', async () => {
    const report = await computeRuntimeHealth({
      configuration: loadRuntimeConfiguration({}),
      store: createInMemoryGovernanceStore(),
      hasPolicyPackProvider: true,
      eventPublishingEnabled: false,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    assert.equal(report.providers.policyPackProvider, true);
    assert.equal(report.providers.eventPublisher, false);
  });

  it('never includes API keys or other authentication secrets', async () => {
    const configuration = loadRuntimeConfiguration({ AOC_RUNTIME_API_KEYS: 'super-secret-key' });
    const report = await computeRuntimeHealth({
      configuration,
      store: createInMemoryGovernanceStore(),
      hasPolicyPackProvider: false,
      eventPublishingEnabled: true,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    assert.ok(!JSON.stringify(report).includes('super-secret-key'));
  });
});
