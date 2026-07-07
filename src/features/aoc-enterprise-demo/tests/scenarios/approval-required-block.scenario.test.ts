import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('approval-required-block scenario', () => {
  it('outcome.status is approval_required', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-required-block');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'approval_required');
  });

  it('executorRan is false and no side effects executed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-required-block');
    assert.equal(run.outcome!.executorRan, false);
    assert.equal(run.outcome!.sideEffectsExecuted, false);
  });

  it('Control Plane snapshot highlights approvals and enforcement', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-required-block');
    const panels = run.controlPlaneSnapshot!.highlightedRows.map((row) => row.panel);
    assert.ok(panels.includes('approvals'));
    assert.ok(panels.includes('enforcement'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-required-block');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });

  it('exported artifacts exist', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-required-block');
    assert.equal(run.exportArtifacts.length, 5);
  });
});
