import { buildPMFreakAgentPassportRegistryFixture } from '../pmfreak-agent-passport/index.js';
import {
  PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT,
  PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
  PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID,
  PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID,
  PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  runPMFreakProjectGovernanceScenario,
} from '../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoControlPlaneViewModel } from './pmfreak-demo-control-plane-view-model.js';
import { createDefaultPMFreakDemoControlPlaneDashboard } from './pmfreak-demo-dashboard.js';
import { createPMFreakDemoControlPlaneComparison } from './pmfreak-demo-comparison.js';

/**
 * Deterministic view fixtures for the PMFreak Demo Control Plane View.
 * Every fixture is built from a real `runPMFreakProjectGovernanceScenario`
 * output -- never hand-authored decision data -- so a fixture's decision
 * can never drift from what the scenario runner and passport resolver
 * actually compute.
 */

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

function runBillingReadiness(overrideEvidenceIds: readonly string[], overrideApprovalIds: readonly string[]) {
  return runPMFreakProjectGovernanceScenario(
    {
      scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
      overrideEvidenceIds,
      overrideApprovalIds,
      requestedAt: PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT,
    },
    scenarioRegistry,
    passportRegistry,
  );
}

const billingReadinessMissingBothResult = runBillingReadiness([], []);
const billingReadinessMissingEvidenceResult = runBillingReadiness(['pmfreak.evidence.deliverable_evidence'], ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review']);
const billingReadinessMissingApprovalResult = runBillingReadiness(
  ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
  ['pmfreak.approval.pm_approval'],
);
const billingReadinessAllowedResult = runBillingReadiness(
  ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
  ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
);

const scheduleApplyDeniedResult = runPMFreakProjectGovernanceScenario(
  { scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID, requestedAt: PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT },
  scenarioRegistry,
  passportRegistry,
);

const clientCommunicationApprovalRequiredResult = runPMFreakProjectGovernanceScenario(
  { scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, overrideApprovalIds: [], requestedAt: PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT },
  scenarioRegistry,
  passportRegistry,
);

const changeControlDeniedResult = runPMFreakProjectGovernanceScenario(
  {
    scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID,
    overrideEvidenceIds: ['pmfreak.evidence.change_request_record'],
    overrideApprovalIds: ['pmfreak.approval.pm_approval'],
    requestedAt: PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT,
  },
  scenarioRegistry,
  passportRegistry,
);

export const demoBillingReadinessMissingEvidenceView = createPMFreakDemoControlPlaneViewModel(billingReadinessMissingEvidenceResult);
export const demoBillingReadinessMissingApprovalView = createPMFreakDemoControlPlaneViewModel(billingReadinessMissingApprovalResult);
export const demoBillingReadinessAllowedView = createPMFreakDemoControlPlaneViewModel(billingReadinessAllowedResult);
export const demoScheduleApplyDeniedView = createPMFreakDemoControlPlaneViewModel(scheduleApplyDeniedResult);
export const demoClientCommunicationApprovalRequiredView = createPMFreakDemoControlPlaneViewModel(clientCommunicationApprovalRequiredResult);
export const demoChangeControlDeniedView = createPMFreakDemoControlPlaneViewModel(changeControlDeniedResult);

export const demoPMFreakControlPlaneDashboard = createDefaultPMFreakDemoControlPlaneDashboard();

/**
 * The primary comparison demo: Billing Readiness before required
 * evidence/approval (both missing) vs. Billing Readiness after required
 * evidence/approval are present.
 */
export const demoBillingReadinessComparison = createPMFreakDemoControlPlaneComparison(billingReadinessMissingBothResult, billingReadinessAllowedResult);
