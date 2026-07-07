import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('policy-pack-payment-approval-required scenario', () => {
  it('run status is passed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.equal(run.status, 'passed');
  });

  it('outcome.status is approval_required', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.equal(run.outcome!.status, 'approval_required');
  });

  it('executorRan is false', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.equal(run.outcome!.executorRan, false);
  });

  it('policyDecisionId and policyProofId exist', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.ok(run.outcome!.policyDecisionId !== undefined);
    assert.ok(run.outcome!.policyProofId !== undefined);
  });

  it('policy pack version ids exist', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.ok(run.outcome!.policyPackVersionIds !== undefined && run.outcome!.policyPackVersionIds.length > 0);
  });

  it('matched rule includes the finance-review approval rule', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.ok(run.outcome!.policyMatchedRuleIds?.includes('payments-basic-rule-approve-payment-finance-review'));
  });

  it('Control Plane snapshot highlights Policy Packs and Enforcement', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const panels = run.controlPlaneSnapshot!.visiblePanelIds;
    assert.ok(panels.includes('policy_packs'));
    assert.ok(panels.includes('enforcement'));
  });

  it('export artifacts include policy metadata', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const jsonSummary = run.exportArtifacts.find((artifact) => artifact.type === 'json_summary');
    assert.ok(jsonSummary !== undefined);
    assert.ok(jsonSummary!.content.includes(run.outcome!.policyDecisionId!));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
