import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeEnterpriseHealth } from '../health/health-check.js';
import { loadEnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { createInMemoryGovernanceStore } from '../persistence/in-memory-governance-store.js';
import type { GovernanceStore } from '../persistence/governance-store.js';

describe('computeEnterpriseHealth', () => {
  it('reports healthy when the store is reachable', async () => {
    const report = await computeEnterpriseHealth({
      configuration: loadEnterpriseConfiguration({}),
      store: createInMemoryGovernanceStore(),
      hasPolicyPackProvider: false,
      eventPublishingEnabled: true,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    assert.equal(report.status, 'healthy');
    assert.equal(report.enterpriseVersion, '1.0.0');
    assert.equal(report.persistence.provider, 'memory');
    assert.equal(report.persistence.connected, true);
    assert.equal(report.persistence.status, 'connected');
    assert.equal(report.kernelVersion, '1.0.0');
    assert.equal(report.checkedAt, '2026-01-01T00:00:00.000Z');
  });

  it('reports unhealthy when the store cannot be reached', async () => {
    const unreachableStore: GovernanceStore = {
      ...createInMemoryGovernanceStore(),
      checkConnectivity: async () => false,
    };

    const report = await computeEnterpriseHealth({
      configuration: loadEnterpriseConfiguration({}),
      store: unreachableStore,
      hasPolicyPackProvider: false,
      eventPublishingEnabled: true,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    assert.equal(report.status, 'unhealthy');
    assert.equal(report.persistence.connected, false);
    assert.equal(report.persistence.status, 'unreachable');
  });

  it('reflects whether a policy pack provider and event publishing were configured via the loaded-providers list', async () => {
    const report = await computeEnterpriseHealth({
      configuration: loadEnterpriseConfiguration({}),
      store: createInMemoryGovernanceStore(),
      hasPolicyPackProvider: true,
      eventPublishingEnabled: false,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    assert.ok(report.providers.loaded.includes('policyPackProvider'));
    assert.ok(!report.providers.loaded.includes('eventPublisher'));
  });

  it('never includes API keys or other authentication secrets, and never mislabels itself as src/runtime', async () => {
    const configuration = loadEnterpriseConfiguration({ AOC_ENTERPRISE_API_KEYS: 'super-secret-key' });
    const report = await computeEnterpriseHealth({
      configuration,
      store: createInMemoryGovernanceStore(),
      hasPolicyPackProvider: false,
      eventPublishingEnabled: true,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    assert.ok(!JSON.stringify(report).includes('super-secret-key'));
    assert.equal('runtimeVersion' in report, false);
  });
});
