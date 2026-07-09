import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { createPMFreakDemoControlPlaneDashboard, createDefaultPMFreakDemoControlPlaneDashboard } from '../pmfreak-demo-dashboard.js';
import {
  demoBillingReadinessAllowedView,
  demoChangeControlDeniedView,
  demoClientCommunicationApprovalRequiredView,
  demoPMFreakControlPlaneDashboard,
  demoScheduleApplyDeniedView,
} from '../pmfreak-demo-control-plane-fixtures.js';
import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('createPMFreakDemoControlPlaneDashboard', () => {
  it('20. counts decisions correctly across a known mix of results', () => {
    const missingEvidenceResult = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID, overrideEvidenceIds: ['pmfreak.evidence.deliverable_evidence'], overrideApprovalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'] },
      scenarioRegistry,
      passportRegistry,
    );
    const missingApprovalResult = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID, overrideEvidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'], overrideApprovalIds: ['pmfreak.approval.pm_approval'] },
      scenarioRegistry,
      passportRegistry,
    );
    const allowedResult = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
        overrideEvidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
        overrideApprovalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
      },
      scenarioRegistry,
      passportRegistry,
    );

    const dashboard = createPMFreakDemoControlPlaneDashboard([missingEvidenceResult, missingApprovalResult, allowedResult]);

    assert.equal(dashboard.summaryMetrics.totalScenarios, 3);
    assert.equal(dashboard.summaryMetrics.allowCount, 1);
    assert.equal(dashboard.summaryMetrics.denyCount, 0);
    assert.equal(dashboard.summaryMetrics.holdCount, 0);
    assert.equal(dashboard.summaryMetrics.evidenceRequiredCount, 1);
    assert.equal(dashboard.summaryMetrics.approvalRequiredCount, 1);
    assert.equal(dashboard.summaryMetrics.reviewRequiredCount, 2);
    assert.equal(dashboard.viewModels.length, 3);
  });

  it('the default demo dashboard totals every registered scenario and partitions decisions correctly', () => {
    const dashboard = demoPMFreakControlPlaneDashboard;

    assert.equal(dashboard.summaryMetrics.totalScenarios, 9);
    assert.equal(
      dashboard.summaryMetrics.allowCount +
        dashboard.summaryMetrics.holdCount +
        dashboard.summaryMetrics.denyCount +
        dashboard.summaryMetrics.reviewRequiredCount,
      dashboard.summaryMetrics.totalScenarios,
    );
    assert.equal(dashboard.summaryMetrics.evidenceRequiredCount + dashboard.summaryMetrics.approvalRequiredCount, dashboard.summaryMetrics.reviewRequiredCount);
  });

  it('createDefaultPMFreakDemoControlPlaneDashboard is deterministic', () => {
    const first = createDefaultPMFreakDemoControlPlaneDashboard();
    const second = createDefaultPMFreakDemoControlPlaneDashboard();

    assert.deepEqual(first.summaryMetrics, second.summaryMetrics);
  });

  it('21. never runs production integrations -- the implementation source contains no network/PMFreak-mutation calls', () => {
    const dir = resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-demo-control-plane-view');
    const files = [
      'pmfreak-demo-dashboard.ts',
      'pmfreak-demo-control-plane-view-model.ts',
      'pmfreak-demo-comparison.ts',
      'pmfreak-demo-control-plane-fixtures.ts',
    ];

    const forbidden = ['fetch(', 'axios', 'XMLHttpRequest', 'callPMFreakApi', 'syncPMFreak', 'updateProject', 'createInvoice', 'sendEmail', 'postToSlack'];

    for (const file of files) {
      const source = readFileSync(resolve(dir, file), 'utf8');
      for (const phrase of forbidden) {
        assert.ok(!source.includes(phrase), `${file} must not contain "${phrase}"`);
      }
    }
  });

  it('27. does not mutate the scenario run results it is built from', () => {
    const missingEvidenceResult = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID, overrideEvidenceIds: ['pmfreak.evidence.deliverable_evidence'], overrideApprovalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'] },
      scenarioRegistry,
      passportRegistry,
    );
    const results = [missingEvidenceResult];
    const before = JSON.stringify(results);

    createPMFreakDemoControlPlaneDashboard(results);

    assert.equal(JSON.stringify(results), before);
  });

  it('every demo view fixture is claim-safe and internally consistent', () => {
    for (const view of [demoBillingReadinessAllowedView, demoScheduleApplyDeniedView, demoClientCommunicationApprovalRequiredView, demoChangeControlDeniedView]) {
      assert.ok(view.viewId.length > 0);
      assert.ok(view.scenarioId.length > 0);
    }
  });
});
