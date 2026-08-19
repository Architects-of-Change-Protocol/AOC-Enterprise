import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_SECTION_IDS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

const GOVERNANCE_CHECK_SAFE_LABELS = ['Passport checked', 'Capability checked', 'Authority scope checked', 'Evidence checked', 'Approvals checked', 'Decision presented'] as const;

/**
 * Builds the governance-checks narrative section from an existing Control
 * Plane view model. Only relabels already-computed booleans
 * (`allowedByRuntimeGuard`, `allowedByCapabilityToken`,
 * `allowedByAuthorityScope`, `evidenceSatisfied`, `approvalsSatisfied`) and
 * the already-computed decision -- never re-evaluates any of them.
 */
export function createPMFreakDemoGovernanceChecksSection(viewModel: PMFreakDemoControlPlaneViewModel): PMFreakDemoNarrativeSection {
  const { agentPassportCard, evidencePanel, approvalPanel, decisionBadge } = viewModel;

  const bullets = [
    `Passport checked: ${agentPassportCard.allowedByRuntimeGuard ? 'allowed' : 'not allowed'}`,
    `Capability checked: ${agentPassportCard.allowedByCapabilityToken ? 'allowed' : 'not allowed'}`,
    `Authority scope checked: ${agentPassportCard.allowedByAuthorityScope ? 'allowed' : 'not allowed'}`,
    `Evidence checked: ${evidencePanel.evidenceSatisfied ? 'satisfied' : 'not satisfied'}`,
    `Approvals checked: ${approvalPanel.approvalsSatisfied ? 'satisfied' : 'not satisfied'}`,
    `Decision presented: ${decisionBadge.label} (\`${decisionBadge.decision}\`)`,
  ];

  const section: PMFreakDemoNarrativeSection = {
    sectionId: PMFREAK_DEMO_NARRATIVE_SECTION_IDS.governanceChecks,
    kind: 'governance_checks',
    title: 'Governance Checks',
    summary: 'Soberanía Enterprise checked the existing scenario result against passport, capability, authority scope, evidence and approval gates before presenting a decision.',
    bullets,
    safeLabels: [...GOVERNANCE_CHECK_SAFE_LABELS],
    warnings: [],
  };

  assertNoPMFreakDemoNarrativeOverclaim(section);
  return section;
}
