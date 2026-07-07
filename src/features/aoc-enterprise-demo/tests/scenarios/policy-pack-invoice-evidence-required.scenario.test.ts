import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('policy-pack-invoice-evidence-required scenario', () => {
  it('run status is passed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-invoice-evidence-required');
    assert.equal(run.status, 'passed');
  });

  it('outcome.status is evidence_required', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-invoice-evidence-required');
    assert.equal(run.outcome!.status, 'evidence_required');
  });

  it('executorRan is false', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-invoice-evidence-required');
    assert.equal(run.outcome!.executorRan, false);
  });

  it('evidence requirement includes invoice or purchase_order', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-invoice-evidence-required');
    assert.equal(run.outcome!.policyReasonCode, 'INVOICE_SUPPORT_REQUIRES_PURCHASE_ORDER');
    assert.ok(run.outcome!.policyMatchedRuleIds?.includes('procurement-basic-rule-invoice-support-evidence'));
  });

  it('policy proof exists', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-invoice-evidence-required');
    assert.ok(run.outcome!.policyProofId !== undefined);
  });

  it('Control Plane snapshot highlights Policy Packs', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-invoice-evidence-required');
    assert.ok(run.controlPlaneSnapshot!.visiblePanelIds.includes('policy_packs'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-invoice-evidence-required');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
