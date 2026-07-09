import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakReadOnlyConnectorClient } from '../pmfreak-read-only-client.js';
import { createInMemoryAocPMFreakReadOnlySource } from '../pmfreak-in-memory-source.js';
import { createUnsupportedAocPMFreakRealReadOnlySource } from '../pmfreak-real-source-adapter.js';
import { AOC_PMFREAK_READ_ONLY_CONNECTOR_ID } from '../pmfreak-read-only-connector-constants.js';

describe('AOC PMFreak read-only connector client', () => {
  it('readSnapshot() reads a full snapshot with correct id, read-only flags, counts, and safe labels', async () => {
    const client = createAocPMFreakReadOnlyConnectorClient({ source: createInMemoryAocPMFreakReadOnlySource() });
    const snapshot = await client.readSnapshot();

    assert.equal(snapshot.connectorId, AOC_PMFREAK_READ_ONLY_CONNECTOR_ID);
    assert.equal(snapshot.readOnly, true);
    assert.equal(snapshot.allowMutations, false);
    assert.equal(snapshot.counts.projects, snapshot.projects.length);
    assert.equal(snapshot.counts.actionProposals, snapshot.actionProposals.length);
    assert.ok(snapshot.safeLabels.length > 0);
  });

  it('readSnapshot() is deterministic across independent clients bound to independent in-memory sources', async () => {
    const clientA = createAocPMFreakReadOnlyConnectorClient({ source: createInMemoryAocPMFreakReadOnlySource() });
    const clientB = createAocPMFreakReadOnlyConnectorClient({ source: createInMemoryAocPMFreakReadOnlySource() });

    const snapshotA = await clientA.readSnapshot();
    const snapshotB = await clientB.readSnapshot();

    assert.deepEqual(snapshotA, snapshotB);
  });

  it('readSnapshot() applies redaction according to config.redactionMode', async () => {
    const client = createAocPMFreakReadOnlyConnectorClient({
      config: { redactionMode: 'safe_demo' },
      source: createInMemoryAocPMFreakReadOnlySource({
        projects: [
          {
            projectId: 'project.demo.network-refresh',
            workspaceId: 'workspace.demo.pmfreak',
            milestoneIds: [],
            taskIds: [],
            riskIds: [],
            evidenceReferenceIds: [],
            approvalReferenceIds: [],
            actionProposalIds: [],
            metadata: { contactEmail: 'demo.owner@example.com', apiToken: 'sk-abcdefgh12345678' },
          },
        ],
      }),
    });

    const snapshot = await client.readSnapshot();
    const serialized = JSON.stringify(snapshot.projects[0]!.metadata);

    assert.ok(!serialized.includes('demo.owner@example.com'));
    assert.ok(!serialized.includes('sk-abcdefgh12345678'));
  });

  it('readSnapshot() fails closed with a safe read_failed connector error when a source method rejects', async () => {
    const client = createAocPMFreakReadOnlyConnectorClient({ source: createUnsupportedAocPMFreakRealReadOnlySource('api') });

    await assert.rejects(() => client.readSnapshot());
  });

  it('getHealth() returns a deterministic, read-only health report', async () => {
    const client = createAocPMFreakReadOnlyConnectorClient({ source: createInMemoryAocPMFreakReadOnlySource() });
    const health = await client.getHealth();

    assert.equal(health.status, 'healthy');
    assert.equal(health.readOnly, true);
    assert.equal(health.allowMutations, false);
  });
});
