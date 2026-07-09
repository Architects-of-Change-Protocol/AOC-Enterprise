import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import type { PMFreakDemoEvidencePanel, PMFreakDemoPanelFinding } from './pmfreak-demo-control-plane-view-types.js';

/**
 * Builds a claim-safe evidence panel from a scenario run result. Never
 * re-derives which evidence is missing -- only presents
 * `requiredEvidenceIds`/`missingEvidenceIds`, already computed by
 * `resolvePMFreakAgentPassportAction`.
 */
export function createPMFreakDemoEvidencePanel(result: PMFreakProjectGovernanceScenarioRunResult): PMFreakDemoEvidencePanel {
  const requiredEvidenceIds = result.passportResolution.requiredEvidenceIds;
  const missingEvidenceIds = result.missingEvidenceIds;
  const providedEvidenceIds = requiredEvidenceIds.filter((evidenceId) => !missingEvidenceIds.includes(evidenceId));

  const findings: PMFreakDemoPanelFinding[] = requiredEvidenceIds.map((evidenceId) => {
    const missing = missingEvidenceIds.includes(evidenceId);
    return {
      id: evidenceId,
      label: evidenceId,
      status: missing ? 'failed' : 'passed',
      detail: missing ? 'Required demo evidence is missing.' : 'Required demo evidence is present.',
    };
  });

  const panel: PMFreakDemoEvidencePanel = {
    evidenceSatisfied: result.evidenceSatisfied,
    requiredEvidenceIds,
    missingEvidenceIds,
    providedEvidenceIds,
    findings,
  };

  assertNoPMFreakDemoControlPlaneOverclaim(panel);
  return panel;
}
