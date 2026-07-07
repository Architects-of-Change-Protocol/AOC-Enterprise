import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../services/index.js';

describe('DemoControlPlaneSnapshotService', () => {
  it('creates a snapshot with a trust domain and generatedAt timestamp', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const snapshot = run.controlPlaneSnapshot!;
    assert.equal(snapshot.trustDomainId, 'trust-domain-datasys-agent-republic');
    assert.ok(snapshot.generatedAt.length > 0);
  });

  it('highlights relevant rows for an allowed scenario', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const snapshot = run.controlPlaneSnapshot!;
    assert.ok(snapshot.highlightedRows.length > 0);
    assert.ok(snapshot.highlightedRows.some((row) => row.panel === 'enforcement'));
  });

  it('includes visible panel ids covering overview, enforcement and proofs', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const snapshot = run.controlPlaneSnapshot!;
    assert.ok(snapshot.visiblePanelIds.includes('overview'));
    assert.ok(snapshot.visiblePanelIds.includes('enforcement'));
    assert.ok(snapshot.visiblePanelIds.includes('proofs'));
  });

  it('includes timeline item ids', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const snapshot = run.controlPlaneSnapshot!;
    assert.ok(snapshot.timelineItemIds.length > 0);
  });

  it('includes the proof chain id', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const snapshot = run.controlPlaneSnapshot!;
    assert.deepEqual(snapshot.proofChainIds, [run.proofChain!.id]);
  });

  it('a blocked scenario highlights the enforcement panel', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('adapter-denies-dangerous-action');
    const snapshot = run.controlPlaneSnapshot!;
    assert.ok(snapshot.highlightedRows.some((row) => row.panel === 'enforcement'));
  });

  it('an approval scenario highlights the approvals panel', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-required-block');
    const snapshot = run.controlPlaneSnapshot!;
    assert.ok(snapshot.highlightedRows.some((row) => row.panel === 'approvals'));
  });

  it('an external agent scenario highlights the external agents panel', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('external-agent-limited-visa');
    const snapshot = run.controlPlaneSnapshot!;
    assert.ok(snapshot.highlightedRows.some((row) => row.panel === 'external_agents'));
  });
});
