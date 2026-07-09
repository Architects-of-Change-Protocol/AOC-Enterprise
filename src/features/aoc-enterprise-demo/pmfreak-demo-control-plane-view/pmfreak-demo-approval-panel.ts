import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import type { PMFreakDemoApprovalPanel, PMFreakDemoPanelFinding } from './pmfreak-demo-control-plane-view-types.js';

/**
 * Builds a claim-safe approval panel from a scenario run result. Never
 * re-derives which approval is missing -- only presents
 * `requiredApprovalIds`/`missingApprovalIds`, already computed by
 * `resolvePMFreakAgentPassportAction`.
 */
export function createPMFreakDemoApprovalPanel(result: PMFreakProjectGovernanceScenarioRunResult): PMFreakDemoApprovalPanel {
  const requiredApprovalIds = result.passportResolution.requiredApprovalIds;
  const missingApprovalIds = result.missingApprovalIds;
  const providedApprovalIds = requiredApprovalIds.filter((approvalId) => !missingApprovalIds.includes(approvalId));

  const findings: PMFreakDemoPanelFinding[] = requiredApprovalIds.map((approvalId) => {
    const missing = missingApprovalIds.includes(approvalId);
    return {
      id: approvalId,
      label: approvalId,
      status: missing ? 'failed' : 'passed',
      detail: missing ? 'Required approval is missing before governed execution can proceed.' : 'Required approval is present.',
    };
  });

  const panel: PMFreakDemoApprovalPanel = {
    approvalsSatisfied: result.approvalsSatisfied,
    requiredApprovalIds,
    missingApprovalIds,
    providedApprovalIds,
    findings,
  };

  assertNoPMFreakDemoControlPlaneOverclaim(panel);
  return panel;
}
