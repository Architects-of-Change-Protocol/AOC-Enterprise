import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('policy-pack-sensitive-data-export-requires-compliance scenario', () => {
  it('run status is passed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-sensitive-data-export-requires-compliance');
    assert.equal(run.status, 'passed');
  });

  it('outcome.status is approval_required', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-sensitive-data-export-requires-compliance');
    assert.equal(run.outcome!.status, 'approval_required');
  });

  it('executorRan is false', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-sensitive-data-export-requires-compliance');
    assert.equal(run.outcome!.executorRan, false);
  });

  it('approval requirement includes compliance review', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-sensitive-data-export-requires-compliance');
    assert.equal(run.outcome!.policyReasonCode, 'SENSITIVE_DATA_EXPORT_REQUIRES_COMPLIANCE_REVIEW');
    assert.ok(run.outcome!.policyMatchedRuleIds?.includes('data-boundary-basic-rule-sensitive-export-compliance-review'));
  });

  it('policy proof exists', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-sensitive-data-export-requires-compliance');
    assert.ok(run.outcome!.policyProofId !== undefined);
  });

  it('Control Plane snapshot highlights Policy Packs', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-sensitive-data-export-requires-compliance');
    assert.ok(run.controlPlaneSnapshot!.visiblePanelIds.includes('policy_packs'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-sensitive-data-export-requires-compliance');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
