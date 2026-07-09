import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view-model.js';
import { demoBillingReadinessAllowedView, demoBillingReadinessMissingApprovalView, demoBillingReadinessMissingEvidenceView } from '../pmfreak-demo-control-plane-fixtures.js';
import { PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID } from '../pmfreak-demo-control-plane-view-constants.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('createPMFreakDemoControlPlaneViewModel', () => {
  it('5. builds a view model from the billing readiness missing-evidence result', () => {
    const view = demoBillingReadinessMissingEvidenceView;

    assert.equal(view.viewId, PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID);
    assert.equal(view.scenarioId, PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID);
    assert.equal(view.decisionBadge.decision, 'require_evidence');
    assert.equal(view.evidencePanel.evidenceSatisfied, false);
    assert.ok(view.evidencePanel.missingEvidenceIds.includes('pmfreak.evidence.customer_acceptance_record'));
  });

  it('6. builds a view model from the billing readiness missing-approval result', () => {
    const view = demoBillingReadinessMissingApprovalView;

    assert.equal(view.decisionBadge.decision, 'require_billing_review');
    assert.equal(view.approvalPanel.approvalsSatisfied, false);
    assert.ok(view.approvalPanel.missingApprovalIds.includes('pmfreak.approval.billing_review'));
  });

  it('7. builds a view model from the billing readiness allowed result, never claiming invoice validity or customer-acceptance certification', () => {
    const view = demoBillingReadinessAllowedView;

    assert.equal(view.decisionBadge.decision, 'allow');
    assert.equal(view.evidencePanel.evidenceSatisfied, true);
    assert.equal(view.approvalPanel.approvalsSatisfied, true);

    const text = JSON.stringify(view).toLowerCase();
    assert.ok(!text.includes('invoice is valid'));
    assert.ok(!text.includes('invoice ready certified'));
    assert.ok(!text.includes('customer acceptance certified'));
  });

  it('26. does not mutate the scenario run result it is built from', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, scenarioRegistry, passportRegistry);
    const before = JSON.stringify(result);

    createPMFreakDemoControlPlaneViewModel(result);

    const after = JSON.stringify(result);
    assert.equal(before, after);
  });
});
