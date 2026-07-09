import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  billingReadinessCheckReadinessScenario,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  getPMFreakRealAgentPassportFixtures,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakScenarioRunnerDeps } from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoEvidencePanel } from '../pmfreak-demo-evidence-panel.js';
import { createPMFreakDemoApprovalPanel } from '../pmfreak-demo-approval-panel.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

const [DELIVERABLE_EVIDENCE_ID, CUSTOMER_ACCEPTANCE_EVIDENCE_ID] = billingReadinessCheckReadinessScenario.baselineEvidenceIds;
const [PM_APPROVAL_ID, BILLING_REVIEW_ID] = billingReadinessCheckReadinessScenario.baselineApprovalIds;

describe('createPMFreakDemoEvidencePanel', () => {
  it('13. lists required/provided/missing evidence, with provided derived from required minus missing', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
        overrideEvidenceIds: [DELIVERABLE_EVIDENCE_ID!],
        overrideApprovalIds: [PM_APPROVAL_ID!, BILLING_REVIEW_ID!],
      },
      scenarioRegistry,
      runnerDeps,
    );

    const panel = createPMFreakDemoEvidencePanel(result);

    assert.deepEqual([...panel.requiredEvidenceIds].sort(), [CUSTOMER_ACCEPTANCE_EVIDENCE_ID!, DELIVERABLE_EVIDENCE_ID!].sort());
    assert.deepEqual(panel.missingEvidenceIds, [CUSTOMER_ACCEPTANCE_EVIDENCE_ID!]);
    assert.deepEqual(panel.providedEvidenceIds, [DELIVERABLE_EVIDENCE_ID!]);
    assert.equal(panel.evidenceSatisfied, false);

    for (const evidenceId of panel.requiredEvidenceIds) {
      const finding = panel.findings.find((f) => f.id === evidenceId);
      assert.ok(finding !== undefined);
      assert.ok(!finding!.detail.toLowerCase().includes('customer acceptance is invalid'));
      assert.ok(!finding!.detail.toLowerCase().includes('invoice'));
    }
  });
});

describe('createPMFreakDemoApprovalPanel', () => {
  it('14. lists required/provided/missing approvals, with provided derived from required minus missing', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
        overrideEvidenceIds: [DELIVERABLE_EVIDENCE_ID!, CUSTOMER_ACCEPTANCE_EVIDENCE_ID!],
        overrideApprovalIds: [PM_APPROVAL_ID!],
      },
      scenarioRegistry,
      runnerDeps,
    );

    const panel = createPMFreakDemoApprovalPanel(result);

    assert.deepEqual([...panel.requiredApprovalIds].sort(), [BILLING_REVIEW_ID!, PM_APPROVAL_ID!].sort());
    assert.deepEqual(panel.missingApprovalIds, [BILLING_REVIEW_ID!]);
    assert.deepEqual(panel.providedApprovalIds, [PM_APPROVAL_ID!]);
    assert.equal(panel.approvalsSatisfied, false);

    const missingFinding = panel.findings.find((f) => f.id === BILLING_REVIEW_ID);
    assert.ok(missingFinding !== undefined);
    assert.ok(missingFinding!.detail.toLowerCase().includes('required approval is missing'));
    assert.ok(!missingFinding!.detail.toLowerCase().includes('legally required'));
    assert.ok(!missingFinding!.detail.toLowerCase().includes('invoice legally blocked'));
  });
});
