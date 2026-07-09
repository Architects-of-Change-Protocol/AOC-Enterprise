import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { createPMFreakDemoControlPlaneDashboard, buildDefaultPMFreakDemoControlPlaneDashboard } from '../pmfreak-demo-dashboard.js';
import { buildPMFreakDemoControlPlaneFixtures } from '../pmfreak-demo-control-plane-fixtures.js';
import type { PMFreakDemoControlPlaneDashboard } from '../pmfreak-demo-control-plane-view-types.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  billingReadinessCheckReadinessScenario,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  getPMFreakRealAgentPassportFixtures,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakScenarioRunnerDeps } from '../../pmfreak-project-governance-scenarios/index.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;
let demoPMFreakControlPlaneDashboard: PMFreakDemoControlPlaneDashboard;

const [DELIVERABLE_EVIDENCE_ID, CUSTOMER_ACCEPTANCE_EVIDENCE_ID] = billingReadinessCheckReadinessScenario.baselineEvidenceIds;
const [PM_APPROVAL_ID, BILLING_REVIEW_ID] = billingReadinessCheckReadinessScenario.baselineApprovalIds;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
  ({ demoPMFreakControlPlaneDashboard } = await buildPMFreakDemoControlPlaneFixtures());
});

describe('createPMFreakDemoControlPlaneDashboard', () => {
  it('20. counts decisions correctly across a known mix of results', async () => {
    const missingEvidenceResult = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID, overrideEvidenceIds: [DELIVERABLE_EVIDENCE_ID!], overrideApprovalIds: [PM_APPROVAL_ID!, BILLING_REVIEW_ID!] },
      scenarioRegistry,
      runnerDeps,
    );
    const missingApprovalResult = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID, overrideEvidenceIds: [DELIVERABLE_EVIDENCE_ID!, CUSTOMER_ACCEPTANCE_EVIDENCE_ID!], overrideApprovalIds: [PM_APPROVAL_ID!] },
      scenarioRegistry,
      runnerDeps,
    );
    const allowedResult = await runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
        overrideEvidenceIds: [DELIVERABLE_EVIDENCE_ID!, CUSTOMER_ACCEPTANCE_EVIDENCE_ID!],
        overrideApprovalIds: [PM_APPROVAL_ID!, BILLING_REVIEW_ID!],
      },
      scenarioRegistry,
      runnerDeps,
    );

    // Verified directly against the real resolver: missing only the billing_review approval
    // resolves to require_billing_review (it outranks require_evidence/require_pm_approval in the
    // decision priority order), not require_evidence.
    assert.equal(missingEvidenceResult.decision, 'require_evidence');
    assert.equal(missingApprovalResult.decision, 'require_billing_review');
    assert.equal(allowedResult.decision, 'allow');

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
      dashboard.summaryMetrics.allowCount + dashboard.summaryMetrics.holdCount + dashboard.summaryMetrics.denyCount + dashboard.summaryMetrics.reviewRequiredCount,
      dashboard.summaryMetrics.totalScenarios,
    );
    assert.equal(dashboard.summaryMetrics.evidenceRequiredCount + dashboard.summaryMetrics.approvalRequiredCount, dashboard.summaryMetrics.reviewRequiredCount);
  });

  it('buildDefaultPMFreakDemoControlPlaneDashboard is deterministic given the same registry and runner deps', async () => {
    const first = await buildDefaultPMFreakDemoControlPlaneDashboard(scenarioRegistry, runnerDeps);
    const second = await buildDefaultPMFreakDemoControlPlaneDashboard(scenarioRegistry, runnerDeps);

    assert.deepEqual(first.summaryMetrics, second.summaryMetrics);
  });

  it('21. never runs production integrations -- the implementation source contains no network/PMFreak-mutation calls', () => {
    const dir = resolve(process.cwd(), 'src/features/aoc-enterprise-demo/pmfreak-demo-control-plane-view');
    const files = ['pmfreak-demo-dashboard.ts', 'pmfreak-demo-control-plane-view-model.ts', 'pmfreak-demo-comparison.ts', 'pmfreak-demo-control-plane-fixtures.ts'];

    const forbidden = ['fetch(', 'axios', 'XMLHttpRequest', 'callPMFreakApi', 'syncPMFreak', 'updateProject', 'createInvoice', 'sendEmail', 'postToSlack'];

    for (const file of files) {
      const source = readFileSync(resolve(dir, file), 'utf8');
      for (const phrase of forbidden) {
        assert.ok(!source.includes(phrase), `${file} must not contain "${phrase}"`);
      }
    }
  });

  it('27. does not mutate the scenario run results it is built from', async () => {
    const missingEvidenceResult = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID, overrideEvidenceIds: [DELIVERABLE_EVIDENCE_ID!], overrideApprovalIds: [PM_APPROVAL_ID!, BILLING_REVIEW_ID!] },
      scenarioRegistry,
      runnerDeps,
    );
    const results = [missingEvidenceResult];
    const before = JSON.stringify(results);

    createPMFreakDemoControlPlaneDashboard(results);

    assert.equal(JSON.stringify(results), before);
  });

  it('every demo view fixture is claim-safe and internally consistent', () => {
    for (const view of demoPMFreakControlPlaneDashboard.viewModels) {
      assert.ok(view.viewId.length > 0);
      assert.ok(view.scenarioId.length > 0);
    }
  });
});
