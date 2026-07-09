import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoAgentPassportCard } from './pmfreak-demo-agent-passport-card.js';
import { createPMFreakDemoAttemptedActionCard } from './pmfreak-demo-action-card.js';
import { createPMFreakDemoAuthorityScopePanel } from './pmfreak-demo-authority-panel.js';
import { createPMFreakDemoEvidencePanel } from './pmfreak-demo-evidence-panel.js';
import { createPMFreakDemoApprovalPanel } from './pmfreak-demo-approval-panel.js';
import { createPMFreakDemoTraceTimeline } from './pmfreak-demo-trace-timeline.js';
import { createPMFreakDemoPolicyReferencePanel } from './pmfreak-demo-policy-reference-panel.js';
import { createPMFreakDemoExportPanel } from './pmfreak-demo-export-panel.js';
import { createPMFreakDemoDecisionBadge } from './pmfreak-demo-decision-badges.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import { PMFREAK_DEMO_CONTROL_PLANE_SAFE_LABELS, PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID, PMFREAK_DEMO_CONTROL_PLANE_VIEW_NAME } from './pmfreak-demo-control-plane-view-constants.js';
import type { PMFreakDemoControlPlaneViewModel } from './pmfreak-demo-control-plane-view-types.js';

/**
 * Builds a deterministic, claim-safe Control Plane view model from a single
 * `PMFreakProjectGovernanceScenarioRunResult`.
 *
 * This is a pure presentation-data projection. It never calls
 * `resolvePMFreakAgentPassportAction` or `runPMFreakProjectGovernanceScenario`
 * itself, never recomputes a passport, capability, authority-scope,
 * evidence, or approval decision, and never mutates `scenarioRunResult`.
 */
export function createPMFreakDemoControlPlaneViewModel(scenarioRunResult: PMFreakProjectGovernanceScenarioRunResult): PMFreakDemoControlPlaneViewModel {
  const decisionBadge = createPMFreakDemoDecisionBadge(scenarioRunResult.decision);

  const viewModel: PMFreakDemoControlPlaneViewModel = {
    viewId: PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID,
    viewName: PMFREAK_DEMO_CONTROL_PLANE_VIEW_NAME,

    scenarioId: scenarioRunResult.scenarioId,
    scenarioTitle: scenarioRunResult.scenarioTitle,
    scenarioCategory: scenarioRunResult.category,

    headline: `${scenarioRunResult.scenarioTitle}: ${decisionBadge.label}`,
    summary: scenarioRunResult.safeNarrative,

    decisionBadge,

    agentPassportCard: createPMFreakDemoAgentPassportCard(scenarioRunResult),
    attemptedActionCard: createPMFreakDemoAttemptedActionCard(scenarioRunResult),

    authorityScopePanel: createPMFreakDemoAuthorityScopePanel(scenarioRunResult),
    evidencePanel: createPMFreakDemoEvidencePanel(scenarioRunResult),
    approvalPanel: createPMFreakDemoApprovalPanel(scenarioRunResult),
    traceTimeline: createPMFreakDemoTraceTimeline(scenarioRunResult),
    policyReferencePanel: createPMFreakDemoPolicyReferencePanel(scenarioRunResult),
    exportPanel: createPMFreakDemoExportPanel(scenarioRunResult),

    safeLabels: PMFREAK_DEMO_CONTROL_PLANE_SAFE_LABELS,
    warnings: scenarioRunResult.warnings,
    errors: scenarioRunResult.errors,
  };

  assertNoPMFreakDemoControlPlaneOverclaim(viewModel);
  return viewModel;
}
