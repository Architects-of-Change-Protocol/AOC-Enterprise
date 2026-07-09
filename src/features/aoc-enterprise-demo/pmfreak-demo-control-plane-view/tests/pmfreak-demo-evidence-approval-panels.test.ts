import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoEvidencePanel } from '../pmfreak-demo-evidence-panel.js';
import { createPMFreakDemoApprovalPanel } from '../pmfreak-demo-approval-panel.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('createPMFreakDemoEvidencePanel', () => {
  it('13. lists required/provided/missing evidence, with provided derived from required minus missing', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
        overrideEvidenceIds: ['pmfreak.evidence.deliverable_evidence'],
        overrideApprovalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
      },
      scenarioRegistry,
      passportRegistry,
    );

    const panel = createPMFreakDemoEvidencePanel(result);

    assert.deepEqual([...panel.requiredEvidenceIds].sort(), ['pmfreak.evidence.customer_acceptance_record', 'pmfreak.evidence.deliverable_evidence']);
    assert.deepEqual(panel.missingEvidenceIds, ['pmfreak.evidence.customer_acceptance_record']);
    assert.deepEqual(panel.providedEvidenceIds, ['pmfreak.evidence.deliverable_evidence']);
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
  it('14. lists required/provided/missing approvals, with provided derived from required minus missing', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
        overrideEvidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
        overrideApprovalIds: ['pmfreak.approval.pm_approval'],
      },
      scenarioRegistry,
      passportRegistry,
    );

    const panel = createPMFreakDemoApprovalPanel(result);

    assert.deepEqual([...panel.requiredApprovalIds].sort(), ['pmfreak.approval.billing_review', 'pmfreak.approval.pm_approval']);
    assert.deepEqual(panel.missingApprovalIds, ['pmfreak.approval.billing_review']);
    assert.deepEqual(panel.providedApprovalIds, ['pmfreak.approval.pm_approval']);
    assert.equal(panel.approvalsSatisfied, false);

    const missingFinding = panel.findings.find((f) => f.id === 'pmfreak.approval.billing_review');
    assert.ok(missingFinding !== undefined);
    assert.ok(missingFinding!.detail.toLowerCase().includes('required approval is missing'));
    assert.ok(!missingFinding!.detail.toLowerCase().includes('legally required'));
    assert.ok(!missingFinding!.detail.toLowerCase().includes('invoice legally blocked'));
  });
});
