import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('expired-visa-block scenario', () => {
  it('the visa-expires step passes', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('expired-visa-block');
    const expireStep = run.steps.find((step) => step.stepId === 'visa-expires');
    assert.ok(expireStep !== undefined);
    assert.equal(expireStep!.status, 'passed');
  });

  it('outcome.status is blocked and executorRan is false', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('expired-visa-block');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'blocked');
    assert.equal(run.outcome!.executorRan, false);
  });

  it('Control Plane snapshot highlights the external agents panel', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('expired-visa-block');
    const panels = run.controlPlaneSnapshot!.highlightedRows.map((row) => row.panel);
    assert.ok(panels.includes('external_agents') || panels.includes('enforcement'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('expired-visa-block');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
