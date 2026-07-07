import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../services/index.js';

describe('DemoPolicyPackScenarioService', () => {
  it('1. lists all policy-pack scenarios', () => {
    const suite = createEnterpriseDemoSuite();
    const scenarios = suite.policyPackScenarioService.listPolicyPackScenarios();
    assert.equal(scenarios.length, 8);
    assert.ok(scenarios.every((scenario) => scenario.category === 'policy_packs'));
  });

  it('2. runs payment approval required scenario', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'approval_required');
  });

  it('3. runs bank account denied scenario', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-bank-account-change-denied');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'blocked');
  });

  it('4. runs invoice evidence required scenario', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-invoice-evidence-required');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'evidence_required');
  });

  it('5. runs sensitive data export compliance scenario', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-sensitive-data-export-requires-compliance');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'approval_required');
  });

  it('6. runs prohibited data export denied scenario', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-prohibited-data-export-denied');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'blocked');
  });

  it('7. runs sports settlement evidence scenario', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-sports-settlement-event-record-required');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'evidence_required');
  });

  it('8. runs low-risk read warning allowed scenario', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-low-risk-read-warning-allowed');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'executed');
  });

  it('9. verifies executor safety for blocked scenarios', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-bank-account-change-denied');
    assert.equal(run.outcome!.executorRan, false);
    assert.equal(run.executorSafetyVerified, true);
  });

  it('10. verifies executor runs once for allowed warning scenario', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-low-risk-read-warning-allowed');
    assert.equal(run.outcome!.executorRan, true);
    assert.equal(run.executorSafetyVerified, true);
  });

  it('11. verifies policyDecisionId exists when policy applied', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.ok(run.outcome!.policyDecisionId !== undefined);
    assert.ok(run.policyMetadata.policyDecisionId !== undefined);
    assert.equal(run.policyReferencesVerified, true);
  });

  it('12. verifies policyProofId exists when policy applied', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.ok(run.outcome!.policyProofId !== undefined);
    assert.ok(run.policyMetadata.policyProofId !== undefined);
  });

  it('rejects an unknown or non-policy-pack scenario id', async () => {
    const suite = createEnterpriseDemoSuite();
    await assert.rejects(() => suite.policyPackScenarioService.runScenario('internal-agent-allowed'));
  });

  it('attaches a policy-focused Control Plane snapshot to every run', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    assert.ok(run.policyControlPlaneSnapshot !== undefined);
    assert.equal(run.controlPlaneSnapshotVerified, true);
  });
});
