import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import { PMFREAK_DEMO_CONTROL_PLANE_TRACE_STEP_LABELS } from './pmfreak-demo-control-plane-view-constants.js';
import type { PMFreakDemoTraceTimeline } from './pmfreak-demo-control-plane-view-types.js';

/**
 * Builds a claim-safe trace timeline from a scenario run result's own
 * `scenarioTrace`. Preserves the scenario runner's step order and status
 * verbatim -- this module only relabels each step's `stepId` to the
 * Control Plane view's canonical display label; it never reorders steps or
 * re-derives step status.
 */
export function createPMFreakDemoTraceTimeline(result: PMFreakProjectGovernanceScenarioRunResult): PMFreakDemoTraceTimeline {
  const steps = result.scenarioTrace.map((step, index) => ({
    stepId: step.stepId,
    label: (PMFREAK_DEMO_CONTROL_PLANE_TRACE_STEP_LABELS as Record<string, string>)[step.stepId] ?? step.title,
    status: step.status,
    detail: step.detail,
    order: index + 1,
  }));

  const timeline: PMFreakDemoTraceTimeline = { steps };

  assertNoPMFreakDemoControlPlaneOverclaim(timeline);
  return timeline;
}
