import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('policy-pack-bank-account-change-denied scenario', () => {
  it('run status is passed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-bank-account-change-denied');
    assert.equal(run.status, 'passed');
  });

  it('outcome.status is blocked', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-bank-account-change-denied');
    assert.equal(run.outcome!.status, 'blocked');
  });

  it('executorRan is false', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-bank-account-change-denied');
    assert.equal(run.outcome!.executorRan, false);
  });

  it('matched rule indicates bank account change denial', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-bank-account-change-denied');
    assert.ok(run.outcome!.policyMatchedRuleIds?.includes('payments-basic-rule-change-bank-account-denied'));
    assert.equal(run.outcome!.policyReasonCode, 'BANK_ACCOUNT_CHANGE_DENIED_BY_DEFAULT');
  });

  it('policy proof exists', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-bank-account-change-denied');
    assert.ok(run.outcome!.policyProofId !== undefined);
  });

  it('Control Plane snapshot highlights Policy Packs and Enforcement', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-bank-account-change-denied');
    const panels = run.controlPlaneSnapshot!.visiblePanelIds;
    assert.ok(panels.includes('policy_packs'));
    assert.ok(panels.includes('enforcement'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-bank-account-change-denied');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
