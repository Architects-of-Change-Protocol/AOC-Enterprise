import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createUnsupportedAocPMFreakRealReadOnlySource } from '../pmfreak-real-source-adapter.js';
import { createAocPMFreakReadOnlyConnectorConfig } from '../pmfreak-read-only-connector-config.js';

const config = createAocPMFreakReadOnlyConnectorConfig({ sourceKind: 'api' });

describe('unsupported real PMFreak source adapter', () => {
  it('every list method rejects with a safe unsupported_source_kind connector error', async () => {
    const source = createUnsupportedAocPMFreakRealReadOnlySource('api');

    for (const method of ['listProjects', 'listAgents', 'listMilestones', 'listTasks', 'listRisks', 'listEvidenceReferences', 'listApprovalReferences', 'listActionProposals'] as const) {
      await assert.rejects(async () => {
        await source[method](config);
      });

      try {
        await source[method](config);
        assert.ok(false, `expected ${method} to reject`);
      } catch (error) {
        assert.equal((error as { code?: string }).code, 'unsupported_source_kind');
        assert.equal((error as { safe?: boolean }).safe, true);
      }
    }
  });

  it('reports the requested unsupported source kind', () => {
    assert.equal(createUnsupportedAocPMFreakRealReadOnlySource('database').sourceKind, 'database');
    assert.equal(createUnsupportedAocPMFreakRealReadOnlySource('supabase').sourceKind, 'supabase');
    assert.equal(createUnsupportedAocPMFreakRealReadOnlySource('unknown').sourceKind, 'unknown');
  });

  it('the error message and details never contain a secret, token, or credential', async () => {
    try {
      await createUnsupportedAocPMFreakRealReadOnlySource('supabase').listProjects(config);
      assert.ok(false, 'expected listProjects to reject');
    } catch (error) {
      const serialized = JSON.stringify((error as Error).message) + JSON.stringify((error as { details?: unknown }).details ?? {});
      for (const forbidden of ['token', 'secret', 'key', 'password', 'bearer']) {
        assert.ok(!serialized.toLowerCase().includes(forbidden));
      }
    }
  });
});
