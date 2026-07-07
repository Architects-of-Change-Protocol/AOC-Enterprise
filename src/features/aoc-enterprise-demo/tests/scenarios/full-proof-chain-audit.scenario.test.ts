import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('full-proof-chain-audit scenario', () => {
  it('proof chain exists', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('full-proof-chain-audit');
    assert.equal(run.status, 'passed');
    assert.ok(run.proofChain !== undefined);
    assert.ok(run.proofChain!.proofIds.length > 1);
  });

  it('Control Plane snapshot exists', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('full-proof-chain-audit');
    assert.ok(run.controlPlaneSnapshot !== undefined);
  });

  it('timeline has relevant events', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('full-proof-chain-audit');
    assert.ok(run.controlPlaneSnapshot!.timelineItemIds.length > 0);
  });

  it('operator script explains the proof chain', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('full-proof-chain-audit');
    const walkthrough = run.exportArtifacts.find((artifact) => artifact.type === 'operator_walkthrough');
    assert.ok(walkthrough !== undefined);
    assert.ok(walkthrough!.content.toLowerCase().includes('proof chain'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('full-proof-chain-audit');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
