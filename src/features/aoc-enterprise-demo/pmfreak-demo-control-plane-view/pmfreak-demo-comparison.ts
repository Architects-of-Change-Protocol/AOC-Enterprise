import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoControlPlaneViewModel } from './pmfreak-demo-control-plane-view-model.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import { PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID } from './pmfreak-demo-control-plane-view-constants.js';
import type { PMFreakDemoControlPlaneComparison } from './pmfreak-demo-control-plane-view-types.js';

function buildExplanation(changedDecision: boolean, resolvedEvidenceIds: readonly string[], resolvedApprovalIds: readonly string[]): string {
  if (!changedDecision) {
    return 'The decision did not change between these two demo runs. This does not certify invoice validity, customer acceptance, or contractual compliance.';
  }

  const resolvedParts: string[] = [];
  if (resolvedEvidenceIds.length > 0) resolvedParts.push('required evidence');
  if (resolvedApprovalIds.length > 0) resolvedParts.push('required approval');
  const resolvedText = resolvedParts.length > 0 ? resolvedParts.join(' and ') : 'demo governance inputs';

  return `The decision changed because the later demo run included the ${resolvedText} signals that were missing from the earlier run. This does not certify invoice validity, does not certify customer acceptance, and does not certify contractual compliance.`;
}

/**
 * Builds a claim-safe before/after comparison from two scenario run
 * results. Never re-derives either decision -- only diffs the already-computed
 * `missingEvidenceIds`/`missingApprovalIds` fields to report which signals
 * moved from missing to present.
 */
export function createPMFreakDemoControlPlaneComparison(
  before: PMFreakProjectGovernanceScenarioRunResult,
  after: PMFreakProjectGovernanceScenarioRunResult,
): PMFreakDemoControlPlaneComparison {
  const beforeView = createPMFreakDemoControlPlaneViewModel(before);
  const afterView = createPMFreakDemoControlPlaneViewModel(after);

  const changedDecision = before.decision !== after.decision;
  const resolvedEvidenceIds = before.missingEvidenceIds.filter((evidenceId) => !after.missingEvidenceIds.includes(evidenceId));
  const resolvedApprovalIds = before.missingApprovalIds.filter((approvalId) => !after.missingApprovalIds.includes(approvalId));

  const comparison: PMFreakDemoControlPlaneComparison = {
    comparisonId: `${PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID}.comparison.${before.actionAttemptId}.vs.${after.actionAttemptId}`,
    title: `Comparison: ${before.scenarioTitle}`,
    before: beforeView,
    after: afterView,
    changedDecision,
    resolvedEvidenceIds,
    resolvedApprovalIds,
    explanation: buildExplanation(changedDecision, resolvedEvidenceIds, resolvedApprovalIds),
  };

  assertNoPMFreakDemoControlPlaneOverclaim(comparison);
  return comparison;
}
