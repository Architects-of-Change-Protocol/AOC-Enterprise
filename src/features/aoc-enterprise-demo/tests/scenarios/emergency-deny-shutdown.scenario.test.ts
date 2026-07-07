import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('emergency-deny-shutdown scenario', () => {
  it('outcome.status is emergency_denied', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('emergency-deny-shutdown');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'emergency_denied');
  });

  it('executorRan is false', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('emergency-deny-shutdown');
    assert.equal(run.outcome!.executorRan, false);
  });

  it('emergency status is visible in the run steps', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('emergency-deny-shutdown');
    const activateStep = run.steps.find((step) => step.stepId === 'activate-emergency-deny');
    assert.equal(activateStep?.status, 'passed');
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('emergency-deny-shutdown');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
