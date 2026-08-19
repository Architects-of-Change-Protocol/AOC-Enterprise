import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_SECTION_IDS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

/**
 * Builds the executive summary section from an existing Control Plane view
 * model. Only relabels `decisionBadge` and `summary`, already computed by
 * the Control Plane View -- never re-derives a decision.
 */
export function createPMFreakDemoExecutiveSummarySection(viewModel: PMFreakDemoControlPlaneViewModel): PMFreakDemoNarrativeSection {
  const { decisionBadge } = viewModel;

  const summary = `A PMFreak demo agent attempted a governed demo project-governance action. Soberanía Enterprise evaluated the existing scenario result and returned \`${decisionBadge.decision}\`. ${decisionBadge.description} This export explains the demo decision; it does not create a new decision.`;

  const bullets = [
    `Scenario: ${viewModel.scenarioTitle}`,
    `Decision: ${decisionBadge.label} (\`${decisionBadge.decision}\`)`,
    `Scenario narrative: ${viewModel.summary}`,
    'This export explains an existing Soberanía Enterprise decision. It does not create a new governance decision.',
  ];

  const section: PMFreakDemoNarrativeSection = {
    sectionId: PMFREAK_DEMO_NARRATIVE_SECTION_IDS.executiveSummary,
    kind: 'executive_summary',
    title: 'Executive Summary',
    summary,
    bullets,
    safeLabels: ['Soberanía-governed agent', 'Demo narrative export'],
    warnings: [],
  };

  assertNoPMFreakDemoNarrativeOverclaim(section);
  return section;
}
