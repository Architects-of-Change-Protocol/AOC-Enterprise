import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_SECTION_IDS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

function joinOrNone(ids: readonly string[]): string {
  return ids.length > 0 ? ids.join(', ') : 'none';
}

/**
 * Builds the approval narrative section from an existing Control Plane view
 * model. Only relabels `approvalPanel`'s already-computed
 * required/provided/missing approval ids -- never re-derives which approval
 * is missing.
 */
export function createPMFreakDemoApprovalNarrativeSection(viewModel: PMFreakDemoControlPlaneViewModel): PMFreakDemoNarrativeSection {
  const { approvalPanel } = viewModel;

  const summary = approvalPanel.approvalsSatisfied ? 'Required approval is present.' : 'Required approval is missing before governed execution can proceed.';

  const bullets = [
    `Required approvals: ${joinOrNone(approvalPanel.requiredApprovalIds)}`,
    `Provided approvals: ${joinOrNone(approvalPanel.providedApprovalIds)}`,
    `Missing approvals: ${joinOrNone(approvalPanel.missingApprovalIds)}`,
    `Approvals satisfied: ${approvalPanel.approvalsSatisfied ? 'yes' : 'no'}`,
  ];

  const section: PMFreakDemoNarrativeSection = {
    sectionId: PMFREAK_DEMO_NARRATIVE_SECTION_IDS.approvals,
    kind: 'approvals',
    title: 'Approvals',
    summary,
    bullets,
    safeLabels: ['Approval required'],
    warnings: approvalPanel.approvalsSatisfied ? [] : ['Required approval is missing before governed execution can proceed.'],
  };

  assertNoPMFreakDemoNarrativeOverclaim(section);
  return section;
}
