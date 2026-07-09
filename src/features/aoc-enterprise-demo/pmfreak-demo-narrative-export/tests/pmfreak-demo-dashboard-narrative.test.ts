import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneDashboard } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoNarrativeDashboardExport } from '../pmfreak-demo-dashboard-narrative.js';

let dashboard: PMFreakDemoControlPlaneDashboard;

before(async () => {
  ({ demoPMFreakControlPlaneDashboard: dashboard } = await buildPMFreakDemoControlPlaneFixtures());
});

describe('createPMFreakDemoNarrativeDashboardExport', () => {
  it('29. summarizes dashboard metrics -- total scenarios, decision counts, and per-scenario summaries', () => {
    const dashboardExport = createPMFreakDemoNarrativeDashboardExport(dashboard);

    assert.equal(dashboardExport.totalScenarios, dashboard.summaryMetrics.totalScenarios);
    assert.ok(dashboardExport.decisionSummary.includes(String(dashboard.summaryMetrics.totalScenarios)));
    assert.ok(dashboardExport.decisionSummary.includes(String(dashboard.summaryMetrics.allowCount)));
    assert.ok(dashboardExport.decisionSummary.includes(String(dashboard.summaryMetrics.denyCount)));

    assert.equal(dashboardExport.scenarioSummaries.length, dashboard.viewModels.length);
    assert.deepEqual(
      dashboardExport.scenarioSummaries.map((summary) => summary.scenarioId),
      dashboard.viewModels.map((viewModel) => viewModel.scenarioId),
    );
    assert.deepEqual(
      dashboardExport.scenarioSummaries.map((summary) => summary.decision),
      dashboard.viewModels.map((viewModel) => viewModel.decisionBadge.decision),
    );
  });

  it('30. does not recompute decisions -- every summarized decision comes straight from the dashboard view models', () => {
    const dashboardExport = createPMFreakDemoNarrativeDashboardExport(dashboard);
    const dashboardDecisions = dashboard.viewModels.map((viewModel) => viewModel.decisionBadge.decision);
    const exportDecisions = dashboardExport.scenarioSummaries.map((summary) => summary.decision);

    assert.deepEqual(exportDecisions, dashboardDecisions);
  });

  it('33. does not mutate the Control Plane dashboard it is built from', () => {
    const before = JSON.stringify(dashboard);

    createPMFreakDemoNarrativeDashboardExport(dashboard);

    const after = JSON.stringify(dashboard);
    assert.equal(before, after);
  });
});
