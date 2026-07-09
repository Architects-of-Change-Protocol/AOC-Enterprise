import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import type { PMFreakDemoPanelFinding, PMFreakDemoPolicyReferencePanel } from './pmfreak-demo-control-plane-view-types.js';

const COSTA_RICA_JURISDICTION_PACK_ID = 'aoc.jurisdiction.costa_rica.base.v1';
const COSTA_RICA_JURISDICTION_LABEL = 'Costa Rica jurisdiction context referenced';

/**
 * Builds a claim-safe policy/jurisdiction reference panel from a scenario
 * run result. Never evaluates or certifies compliance -- only presents
 * `appliedPolicyPackIds`/`jurisdictionPackIds`, already computed by the
 * scenario runner and the passport resolver beneath it. A Costa Rica
 * jurisdiction pack reference is surfaced as a context reference only,
 * never as a compliance claim.
 */
export function createPMFreakDemoPolicyReferencePanel(result: PMFreakProjectGovernanceScenarioRunResult): PMFreakDemoPolicyReferencePanel {
  const appliedPolicyPackIds = result.appliedPolicyPackIds;
  const jurisdictionPackIds = result.jurisdictionPackIds;
  const referencesCostaRica = jurisdictionPackIds.includes(COSTA_RICA_JURISDICTION_PACK_ID);

  const findings: PMFreakDemoPanelFinding[] = [
    {
      id: 'applied_policy_packs',
      label: 'Applied policy packs',
      status: appliedPolicyPackIds.length > 0 ? 'passed' : 'not_applicable',
      detail: appliedPolicyPackIds.length > 0 ? `Policy packs referenced: ${appliedPolicyPackIds.join(', ')}.` : 'No policy pack was referenced for this demo attempt.',
    },
  ];

  if (referencesCostaRica) {
    findings.push({
      id: 'jurisdiction_costa_rica',
      label: COSTA_RICA_JURISDICTION_LABEL,
      status: 'passed',
      detail: 'This demo project context references the Costa Rica jurisdiction pack as a routing key only. It does not certify Costa Rica legal compliance.',
    });
  }

  const panel: PMFreakDemoPolicyReferencePanel = {
    appliedPolicyPackIds,
    jurisdictionPackIds,
    ...(referencesCostaRica ? { jurisdictionContextLabel: COSTA_RICA_JURISDICTION_LABEL } : {}),
    findings,
  };

  assertNoPMFreakDemoControlPlaneOverclaim(panel);
  return panel;
}
