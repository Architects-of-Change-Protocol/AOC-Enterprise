import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('evidence-required-block scenario', () => {
  it('outcome.status is evidence_required', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('evidence-required-block');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'evidence_required');
  });

  it('executorRan is false', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('evidence-required-block');
    assert.equal(run.outcome!.executorRan, false);
  });

  it('Control Plane snapshot shows the evidence requirement via the enforcement panel', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('evidence-required-block');
    const panels = run.controlPlaneSnapshot!.highlightedRows.map((row) => row.panel);
    assert.ok(panels.includes('enforcement'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('evidence-required-block');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
