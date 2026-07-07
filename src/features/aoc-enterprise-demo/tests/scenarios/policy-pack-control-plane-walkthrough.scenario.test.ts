import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('policy-pack-control-plane-walkthrough scenario', () => {
  it('run status is passed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-control-plane-walkthrough');
    assert.equal(run.status, 'passed');
  });

  it('outcome.status is executed (the sweep closes on an allowed action)', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-control-plane-walkthrough');
    assert.equal(run.outcome!.status, 'executed');
  });

  it('the Control Plane policy section exists with decision and proof rows', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-control-plane-walkthrough');
    const viewModel = run.policyControlPlaneSnapshot.viewModel;
    assert.ok(viewModel.packs.length > 0);
    assert.ok(viewModel.decisions.length >= 6);
    assert.ok(viewModel.proofs.length >= 6);
  });

  it('enforcement link rows exist', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-control-plane-walkthrough');
    const viewModel = run.policyControlPlaneSnapshot.viewModel;
    assert.ok(viewModel.enforcementLinks.length >= 6);
  });

  it('operator narration references Policy Packs, Enforcement and Proofs', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-control-plane-walkthrough');
    const panels = new Set(run.policyControlPlaneSnapshot.walkthroughAnchors.map((anchor) => anchor.panel));
    assert.ok(panels.has('policy_packs'));
    assert.ok(panels.has('enforcement'));
    assert.ok(panels.has('proofs'));
  });

  it('Control Plane snapshot highlights Policy Packs', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-control-plane-walkthrough');
    assert.ok(run.controlPlaneSnapshot!.visiblePanelIds.includes('policy_packs'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-control-plane-walkthrough');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
