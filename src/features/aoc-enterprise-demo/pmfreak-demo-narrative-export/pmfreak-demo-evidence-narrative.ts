import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_SECTION_IDS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

function joinOrNone(ids: readonly string[]): string {
  return ids.length > 0 ? ids.join(', ') : 'none';
}

/**
 * Builds the evidence narrative section from an existing Control Plane view
 * model. Only relabels `evidencePanel`'s already-computed
 * required/provided/missing evidence ids -- never re-derives which evidence
 * is missing.
 */
export function createPMFreakDemoEvidenceNarrativeSection(viewModel: PMFreakDemoControlPlaneViewModel): PMFreakDemoNarrativeSection {
  const { evidencePanel } = viewModel;

  const summary = evidencePanel.evidenceSatisfied ? 'Required demo evidence is present.' : 'Required demo evidence is missing before governed execution can proceed.';

  const bullets = [
    `Required evidence: ${joinOrNone(evidencePanel.requiredEvidenceIds)}`,
    `Provided evidence: ${joinOrNone(evidencePanel.providedEvidenceIds)}`,
    `Missing evidence: ${joinOrNone(evidencePanel.missingEvidenceIds)}`,
    `Evidence satisfied: ${evidencePanel.evidenceSatisfied ? 'yes' : 'no'}`,
  ];

  const section: PMFreakDemoNarrativeSection = {
    sectionId: PMFREAK_DEMO_NARRATIVE_SECTION_IDS.evidence,
    kind: 'evidence',
    title: 'Evidence',
    summary,
    bullets,
    safeLabels: ['Evidence required'],
    warnings: evidencePanel.evidenceSatisfied ? [] : ['Required demo evidence is missing before governed execution can proceed.'],
  };

  assertNoPMFreakDemoNarrativeOverclaim(section);
  return section;
}
