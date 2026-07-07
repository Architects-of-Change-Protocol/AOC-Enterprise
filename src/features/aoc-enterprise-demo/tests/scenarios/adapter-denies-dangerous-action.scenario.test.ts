import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('adapter-denies-dangerous-action scenario', () => {
  it('enforcement decision reason mentions the adapter denial', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('adapter-denies-dangerous-action');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'blocked');
  });

  it('executorRan is false and side effect blocked', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('adapter-denies-dangerous-action');
    assert.equal(run.outcome!.executorRan, false);
    assert.equal(run.outcome!.sideEffectsExecuted, false);
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('adapter-denies-dangerous-action');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
