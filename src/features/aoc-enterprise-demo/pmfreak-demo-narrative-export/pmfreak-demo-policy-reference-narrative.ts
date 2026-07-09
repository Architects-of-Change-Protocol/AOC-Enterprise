import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_SECTION_IDS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

function joinOrNone(ids: readonly string[]): string {
  return ids.length > 0 ? ids.join(', ') : 'none';
}

/**
 * Builds the policy/jurisdiction reference narrative section from an
 * existing Control Plane view model. Only relabels
 * `policyReferencePanel`'s already-computed pack ids -- never evaluates or
 * certifies compliance for any policy or jurisdiction. A Costa Rica
 * jurisdiction pack reference, when present, is surfaced as a context
 * reference only, never as a compliance claim.
 */
export function createPMFreakDemoPolicyReferenceNarrativeSection(viewModel: PMFreakDemoControlPlaneViewModel): PMFreakDemoNarrativeSection {
  const { policyReferencePanel } = viewModel;
  const jurisdictionContextLabel = policyReferencePanel.jurisdictionContextLabel;

  const bullets = [
    `Applied policy packs: ${joinOrNone(policyReferencePanel.appliedPolicyPackIds)}`,
    `Jurisdiction packs: ${joinOrNone(policyReferencePanel.jurisdictionPackIds)}`,
    ...(jurisdictionContextLabel !== undefined ? [jurisdictionContextLabel] : []),
  ];

  const section: PMFreakDemoNarrativeSection = {
    sectionId: PMFREAK_DEMO_NARRATIVE_SECTION_IDS.policyReferences,
    kind: 'policy_references',
    title: 'Policy / Jurisdiction References',
    summary: 'This section presents the policy and jurisdiction pack references already applied to this demo scenario run. It does not certify compliance for any jurisdiction.',
    bullets,
    safeLabels: jurisdictionContextLabel !== undefined ? [jurisdictionContextLabel] : [],
    warnings: [],
  };

  assertNoPMFreakDemoNarrativeOverclaim(section);
  return section;
}
