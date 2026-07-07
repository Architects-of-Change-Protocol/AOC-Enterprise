import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('policy-pack-prohibited-data-export-denied scenario', () => {
  it('run status is passed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-prohibited-data-export-denied');
    assert.equal(run.status, 'passed');
  });

  it('outcome.status is blocked', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-prohibited-data-export-denied');
    assert.equal(run.outcome!.status, 'blocked');
  });

  it('executorRan is false', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-prohibited-data-export-denied');
    assert.equal(run.outcome!.executorRan, false);
  });

  it('policy denied with the prohibited-export rule', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-prohibited-data-export-denied');
    assert.equal(run.outcome!.policyReasonCode, 'PROHIBITED_DATA_DOMAIN_EXPORT_DENIED');
    assert.ok(run.outcome!.policyMatchedRuleIds?.includes('data-boundary-basic-rule-prohibited-export-denied'));
  });

  it('policy proof exists', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-prohibited-data-export-denied');
    assert.ok(run.outcome!.policyProofId !== undefined);
  });

  it('Control Plane snapshot highlights Policy Packs', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-prohibited-data-export-denied');
    assert.ok(run.controlPlaneSnapshot!.visiblePanelIds.includes('policy_packs'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-prohibited-data-export-denied');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
