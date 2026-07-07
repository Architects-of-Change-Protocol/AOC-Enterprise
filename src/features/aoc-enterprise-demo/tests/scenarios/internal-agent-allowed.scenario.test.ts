import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('internal-agent-allowed scenario', () => {
  it('runs deterministically and passes', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');

    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'executed');
    assert.equal(run.outcome!.executorRan, true);
    assert.equal(run.outcome!.sideEffectsExecuted, true);
  });

  it('enforcement decision id and reason are recorded', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.ok(run.outcome!.enforcementDecisionId !== undefined);
    assert.ok(run.outcome!.reasonCode.length > 0);
  });

  it('proof chain includes enforcement and authority at minimum', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.ok(run.proofChain!.sources.includes('enforcement'));
    assert.ok(run.proofChain!.sources.includes('authority'));
  });

  it('Control Plane snapshot exists', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.ok(run.controlPlaneSnapshot !== undefined);
  });

  it('exported artifacts exist', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.equal(run.exportArtifacts.length, 5);
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
