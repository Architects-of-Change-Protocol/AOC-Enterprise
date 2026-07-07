import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('policy-pack-low-risk-read-warning-allowed scenario', () => {
  it('run status is passed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-low-risk-read-warning-allowed');
    assert.equal(run.status, 'passed');
  });

  it('outcome.status is executed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-low-risk-read-warning-allowed');
    assert.equal(run.outcome!.status, 'executed');
  });

  it('executorRan is true', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-low-risk-read-warning-allowed');
    assert.equal(run.outcome!.executorRan, true);
  });

  it('policy allow (or warning) is recorded', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-low-risk-read-warning-allowed');
    assert.equal(run.outcome!.policyReasonCode, 'NON_SENSITIVE_PROJECT_SUMMARY_READ_ALLOWED');
    assert.ok(run.outcome!.policyMatchedRuleIds?.includes('data-boundary-basic-rule-non-sensitive-read-allowed'));
  });

  it('policy proof exists', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-low-risk-read-warning-allowed');
    assert.ok(run.outcome!.policyProofId !== undefined);
  });

  it('Control Plane shows warning but execution result executed, not blocked', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-low-risk-read-warning-allowed');
    assert.ok(run.controlPlaneSnapshot!.visiblePanelIds.includes('policy_packs'));
    assert.equal(run.outcome!.status, 'executed');
    assert.equal(run.outcome!.sideEffectsExecuted, true);
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-low-risk-read-warning-allowed');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
