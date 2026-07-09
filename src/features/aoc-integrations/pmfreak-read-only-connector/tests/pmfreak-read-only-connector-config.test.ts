import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakReadOnlyConnectorConfig } from '../pmfreak-read-only-connector-config.js';

describe('AOC PMFreak Read-Only Connector config', () => {
  it('creates a safe default config', () => {
    const config = createAocPMFreakReadOnlyConnectorConfig();

    assert.equal(config.environment, 'demo');
    assert.equal(config.sourceKind, 'in_memory');
    assert.equal(config.readOnly, true);
    assert.equal(config.allowMutations, false);
    assert.equal(config.redactionMode, 'safe_demo');
    assert.equal(config.timeoutMs, 5000);
    assert.equal(config.maxRecords, 100);
    assert.deepEqual(config.warnings, []);
  });

  it('cannot enable mutations -- unsafe input values are forced safe with warnings', () => {
    const config = createAocPMFreakReadOnlyConnectorConfig({ readOnly: false, allowMutations: true });

    assert.equal(config.readOnly, true);
    assert.equal(config.allowMutations, false);
    assert.ok(config.warnings.includes('readOnly was forced to true.'));
    assert.ok(config.warnings.includes('allowMutations was forced to false.'));
  });

  it('does not require a baseUrl for the in_memory source', () => {
    const config = createAocPMFreakReadOnlyConnectorConfig({ sourceKind: 'in_memory' });
    assert.equal(config.baseUrl, undefined);
  });

  it('accepts explicit safe overrides without adding warnings', () => {
    const config = createAocPMFreakReadOnlyConnectorConfig({ environment: 'development', maxRecords: 50, redactionMode: 'strict' });

    assert.equal(config.environment, 'development');
    assert.equal(config.maxRecords, 50);
    assert.equal(config.redactionMode, 'strict');
    assert.deepEqual(config.warnings, []);
  });

  it('is a pure, deterministic function', () => {
    const first = createAocPMFreakReadOnlyConnectorConfig({ tenantId: 'tenant.demo.pmfreak' });
    const second = createAocPMFreakReadOnlyConnectorConfig({ tenantId: 'tenant.demo.pmfreak' });
    assert.deepEqual(first, second);
  });
});
