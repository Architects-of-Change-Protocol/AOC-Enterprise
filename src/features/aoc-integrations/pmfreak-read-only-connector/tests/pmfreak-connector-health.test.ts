import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakConnectorHealth } from '../pmfreak-connector-health.js';
import { createAocPMFreakReadOnlyConnectorConfig } from '../pmfreak-read-only-connector-config.js';

describe('AOC PMFreak connector health', () => {
  it('is healthy without warnings or errors', () => {
    const health = createAocPMFreakConnectorHealth({ config: createAocPMFreakReadOnlyConnectorConfig() });

    assert.equal(health.status, 'healthy');
    assert.equal(health.readOnly, true);
    assert.equal(health.allowMutations, false);
  });

  it('is degraded with warnings and no errors', () => {
    const health = createAocPMFreakConnectorHealth({ config: createAocPMFreakReadOnlyConnectorConfig(), warnings: ['a demo warning'] });

    assert.ok(health.warnings.length > 0);
    assert.equal(health.status, 'degraded');
  });

  it('is unavailable with errors', () => {
    const health = createAocPMFreakConnectorHealth({ config: createAocPMFreakReadOnlyConnectorConfig(), errors: ['a demo error'] });

    assert.ok(health.errors.length > 0);
    assert.equal(health.status, 'unavailable');
  });

  it('errors take precedence over warnings', () => {
    const health = createAocPMFreakConnectorHealth({ config: createAocPMFreakReadOnlyConnectorConfig(), warnings: ['w'], errors: ['e'] });
    assert.equal(health.status, 'unavailable');
  });
});
