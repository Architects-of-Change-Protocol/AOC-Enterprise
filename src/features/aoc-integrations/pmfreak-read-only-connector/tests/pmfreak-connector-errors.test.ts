import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakConnectorError } from '../pmfreak-connector-errors.js';

describe('AOC PMFreak connector error', () => {
  it('is safe and does not leak a token/secret/connection string', () => {
    const error = createAocPMFreakConnectorError('source_unavailable', 'PMFreak source is unavailable.', { sourceKind: 'api' });

    assert.equal(error.code, 'source_unavailable');
    assert.equal(error.safe, true);

    const serialized = JSON.stringify(error.message) + JSON.stringify(error.details ?? {});
    for (const forbidden of ['token', 'secret', 'authorization', 'connection string', 'bearer ']) {
      assert.ok(!serialized.toLowerCase().includes(forbidden), `expected error not to leak "${forbidden}"`);
    }
  });

  it('is throwable and carries its code through a catch block', () => {
    assert.throws(() => {
      throw createAocPMFreakConnectorError('invalid_config', 'Invalid PMFreak connector config.');
    });

    try {
      throw createAocPMFreakConnectorError('invalid_config', 'Invalid PMFreak connector config.');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: string }).code, 'invalid_config');
      assert.equal((error as { safe?: boolean }).safe, true);
    }
  });
});
