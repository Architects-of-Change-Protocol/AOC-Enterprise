import { buildPMFreakAgentPassportRegistryFixture } from '../pmfreak-agent-passport/index.js';
import {
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  runPMFreakProjectGovernanceScenario,
} from '../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakAgentPassportDecision } from '../pmfreak-agent-passport/index.js';
import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoControlPlaneViewModel } from './pmfreak-demo-control-plane-view-model.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import {
  PMFREAK_DEMO_CONTROL_PLANE_PRIMARY_SCENARIO_ID,
  PMFREAK_DEMO_CONTROL_PLANE_SAFE_LABELS,
  PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID,
} from './pmfreak-demo-control-plane-view-constants.js';
import type { PMFreakDemoControlPlaneDashboard, PMFreakDemoControlPlaneDashboardMetrics } from './pmfreak-demo-control-plane-view-types.js';

const APPROVAL_REVIEW_DECISIONS: ReadonlySet<PMFreakAgentPassportDecision> = new Set([
  'require_pm_approval',
  'require_customer_validation',
  'require_contract_review',
  'require_billing_review',
  'require_legal_review',
  'require_security_review',
  'require_executive_approval',
]);

function computeDashboardMetrics(scenarioResults: readonly PMFreakProjectGovernanceScenarioRunResult[]): PMFreakDemoControlPlaneDashboardMetrics {
  let allowCount = 0;
  let holdCount = 0;
  let denyCount = 0;
  let evidenceRequiredCount = 0;
  let approvalRequiredCount = 0;

  for (const result of scenarioResults) {
    if (result.decision === 'allow') allowCount += 1;
    else if (result.decision === 'hold') holdCount += 1;
    else if (result.decision === 'deny') denyCount += 1;
    else if (result.decision === 'require_evidence') evidenceRequiredCount += 1;
    else if (APPROVAL_REVIEW_DECISIONS.has(result.decision)) approvalRequiredCount += 1;
  }

  return {
    totalScenarios: scenarioResults.length,
    allowCount,
    holdCount,
    denyCount,
    reviewRequiredCount: evidenceRequiredCount + approvalRequiredCount,
    evidenceRequiredCount,
    approvalRequiredCount,
  };
}

/**
 * Builds a Control Plane dashboard model by mapping already-run scenario
 * results into view models and summary metrics. Never runs a scenario or
 * calls `resolvePMFreakAgentPassportAction` -- callers supply the run
 * results, typically from `runPMFreakProjectGovernanceScenario`.
 */
export function createPMFreakDemoControlPlaneDashboard(scenarioResults: readonly PMFreakProjectGovernanceScenarioRunResult[]): PMFreakDemoControlPlaneDashboard {
  const dashboard: PMFreakDemoControlPlaneDashboard = {
    dashboardId: `${PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID}.dashboard`,
    title: 'PMFreak Demo Control Plane Dashboard',
    description: 'A deterministic, presentation-ready view of PMFreak project-governance demo scenario decisions, grouped with summary metrics.',
    primaryScenarioId: PMFREAK_DEMO_CONTROL_PLANE_PRIMARY_SCENARIO_ID,
    viewModels: scenarioResults.map((result) => createPMFreakDemoControlPlaneViewModel(result)),
    summaryMetrics: computeDashboardMetrics(scenarioResults),
    safeLabels: PMFREAK_DEMO_CONTROL_PLANE_SAFE_LABELS,
  };

  assertNoPMFreakDemoControlPlaneOverclaim(dashboard);
  return dashboard;
}

/**
 * Runs every deterministic demo scenario (via the existing scenario runner
 * and demo registries -- never a real PMFreak API) and builds the resulting
 * dashboard. This is the only place in this module that calls
 * `runPMFreakProjectGovernanceScenario`; every other builder in this module
 * only consumes already-run results.
 */
export function createDefaultPMFreakDemoControlPlaneDashboard(): PMFreakDemoControlPlaneDashboard {
  const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
  const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

  const scenarioResults = demoPMFreakProjectGovernanceScenarios.map((scenario) => runPMFreakProjectGovernanceScenario({ scenarioId: scenario.scenarioId }, scenarioRegistry, passportRegistry));

  return createPMFreakDemoControlPlaneDashboard(scenarioResults);
}
