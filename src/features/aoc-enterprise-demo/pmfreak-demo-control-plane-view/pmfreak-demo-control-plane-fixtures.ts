import {
  PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT,
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID,
  PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID,
  PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID,
  billingReadinessCheckReadinessScenario,
  changeControlApproveChangeRequestScenario,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  getPMFreakRealAgentPassportFixtures,
  runPMFreakProjectGovernanceScenario,
} from '../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoControlPlaneViewModel } from './pmfreak-demo-control-plane-view-model.js';
import { buildDefaultPMFreakDemoControlPlaneDashboard } from './pmfreak-demo-dashboard.js';
import { createPMFreakDemoControlPlaneComparison } from './pmfreak-demo-comparison.js';
import type { PMFreakDemoControlPlaneComparison, PMFreakDemoControlPlaneDashboard, PMFreakDemoControlPlaneViewModel } from './pmfreak-demo-control-plane-view-types.js';

/**
 * Deterministic view fixtures for the PMFreak Demo Control Plane View.
 * Every fixture is built from a real `runPMFreakProjectGovernanceScenario`
 * output -- never hand-authored decision data -- so a fixture's decision can
 * never drift from what the scenario runner and the real
 * `@aoc-enterprise/pmfreak-agent-passport-foundation` resolver actually
 * compute.
 *
 * Building these fixtures requires a real, issued `AgentPassport` per role
 * (`getPMFreakRealAgentPassportFixtures`), which is inherently async --
 * unlike the old demo pack's hand-authored, synchronous passport registry.
 * `buildPMFreakDemoControlPlaneFixtures` is therefore an async factory,
 * memoized so every caller in a process shares the same computed fixtures.
 */
export interface PMFreakDemoControlPlaneFixtures {
  readonly demoBillingReadinessMissingEvidenceView: PMFreakDemoControlPlaneViewModel;
  readonly demoBillingReadinessMissingApprovalView: PMFreakDemoControlPlaneViewModel;
  readonly demoBillingReadinessAllowedView: PMFreakDemoControlPlaneViewModel;
  readonly demoScheduleApplyDeniedView: PMFreakDemoControlPlaneViewModel;
  readonly demoClientCommunicationApprovalRequiredView: PMFreakDemoControlPlaneViewModel;
  readonly demoChangeControlDeniedView: PMFreakDemoControlPlaneViewModel;
  readonly demoPMFreakControlPlaneDashboard: PMFreakDemoControlPlaneDashboard;
  readonly demoBillingReadinessComparison: PMFreakDemoControlPlaneComparison;
}

async function buildPMFreakDemoControlPlaneFixturesUncached(): Promise<PMFreakDemoControlPlaneFixtures> {
  const fixtures = await getPMFreakRealAgentPassportFixtures();
  const runnerDeps: PMFreakScenarioRunnerDeps = { fixtures };
  const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);

  const deliverableEvidenceId = billingReadinessCheckReadinessScenario.baselineEvidenceIds[0] as string;
  const customerAcceptanceEvidenceId = billingReadinessCheckReadinessScenario.baselineEvidenceIds[1] as string;
  const pmApprovalId = billingReadinessCheckReadinessScenario.baselineApprovalIds[0] as string;
  const billingReviewId = billingReadinessCheckReadinessScenario.baselineApprovalIds[1] as string;
  const changeRequestRecordEvidenceId = changeControlApproveChangeRequestScenario.baselineEvidenceIds[0] as string;

  function runBillingReadiness(overrideEvidenceIds: readonly string[], overrideApprovalIds: readonly string[]) {
    return runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID, overrideEvidenceIds, overrideApprovalIds, requestedAt: PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT },
      scenarioRegistry,
      runnerDeps,
    );
  }

  const [
    billingReadinessMissingBothResult,
    billingReadinessMissingEvidenceResult,
    billingReadinessMissingApprovalResult,
    billingReadinessAllowedResult,
    scheduleApplyDeniedResult,
    clientCommunicationApprovalRequiredResult,
    changeControlDeniedResult,
  ] = await Promise.all([
    runBillingReadiness([], []),
    runBillingReadiness([deliverableEvidenceId], [pmApprovalId, billingReviewId]),
    runBillingReadiness([deliverableEvidenceId, customerAcceptanceEvidenceId], [pmApprovalId]),
    runBillingReadiness([deliverableEvidenceId, customerAcceptanceEvidenceId], [pmApprovalId, billingReviewId]),
    runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID, requestedAt: PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT }, scenarioRegistry, runnerDeps),
    runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, overrideApprovalIds: [], requestedAt: PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT },
      scenarioRegistry,
      runnerDeps,
    ),
    runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID,
        overrideEvidenceIds: [changeRequestRecordEvidenceId],
        overrideApprovalIds: [],
        requestedAt: PMFREAK_PROJECT_GOVERNANCE_DEMO_REQUESTED_AT,
      },
      scenarioRegistry,
      runnerDeps,
    ),
  ]);

  const demoPMFreakControlPlaneDashboard = await buildDefaultPMFreakDemoControlPlaneDashboard(scenarioRegistry, runnerDeps);

  return {
    demoBillingReadinessMissingEvidenceView: createPMFreakDemoControlPlaneViewModel(billingReadinessMissingEvidenceResult),
    demoBillingReadinessMissingApprovalView: createPMFreakDemoControlPlaneViewModel(billingReadinessMissingApprovalResult),
    demoBillingReadinessAllowedView: createPMFreakDemoControlPlaneViewModel(billingReadinessAllowedResult),
    demoScheduleApplyDeniedView: createPMFreakDemoControlPlaneViewModel(scheduleApplyDeniedResult),
    demoClientCommunicationApprovalRequiredView: createPMFreakDemoControlPlaneViewModel(clientCommunicationApprovalRequiredResult),
    demoChangeControlDeniedView: createPMFreakDemoControlPlaneViewModel(changeControlDeniedResult),
    demoPMFreakControlPlaneDashboard,
    /**
     * The primary comparison demo: Billing Readiness before required
     * evidence/approval (both missing) vs. Billing Readiness after required
     * evidence/approval are present.
     */
    demoBillingReadinessComparison: createPMFreakDemoControlPlaneComparison(billingReadinessMissingBothResult, billingReadinessAllowedResult),
  };
}

let cachedFixtures: Promise<PMFreakDemoControlPlaneFixtures> | undefined;

/**
 * Returns this process's single, memoized set of Control Plane view
 * fixtures. The first caller triggers real (async) passport issuance and
 * scenario runs; every subsequent caller receives the same already-built
 * result.
 */
export function buildPMFreakDemoControlPlaneFixtures(): Promise<PMFreakDemoControlPlaneFixtures> {
  if (cachedFixtures === undefined) cachedFixtures = buildPMFreakDemoControlPlaneFixturesUncached();
  return cachedFixtures;
}
