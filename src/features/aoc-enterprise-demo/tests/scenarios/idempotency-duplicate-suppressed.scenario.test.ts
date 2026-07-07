import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('idempotency-duplicate-suppressed scenario', () => {
  it('the run passes with the second submission reported as duplicate_suppressed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('idempotency-duplicate-suppressed');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'duplicate_suppressed');
    const firstStep = run.steps.find((step) => step.stepId === 'enforcement-first-execution');
    const secondStep = run.steps.find((step) => step.stepId === 'enforcement-duplicate-suppressed');
    assert.equal(firstStep?.status, 'passed');
    assert.equal(secondStep?.status, 'passed');
  });

  it('second executorRan is false', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('idempotency-duplicate-suppressed');
    assert.equal(run.outcome!.executorRan, false);
  });

  it('idempotency key is visible in the run steps', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('idempotency-duplicate-suppressed');
    const controlPlaneStep = run.steps.find((step) => step.kind === 'control_plane');
    assert.ok(controlPlaneStep !== undefined);
    assert.ok(controlPlaneStep!.summary.includes('idempotency-key-demo-follow-up'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('idempotency-duplicate-suppressed');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
