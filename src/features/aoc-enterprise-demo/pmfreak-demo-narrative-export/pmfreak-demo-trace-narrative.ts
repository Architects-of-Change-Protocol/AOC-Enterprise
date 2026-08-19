import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_SECTION_IDS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

/**
 * Builds the trace narrative section from an existing Control Plane view
 * model. Only relabels `traceTimeline.steps` into bullet text, preserving
 * the Control Plane trace's own order and step labels verbatim -- never
 * reorders steps, never invents a step, and never re-derives step status.
 */
export function createPMFreakDemoTraceNarrativeSection(viewModel: PMFreakDemoControlPlaneViewModel): PMFreakDemoNarrativeSection {
  const bullets = viewModel.traceTimeline.steps.map((step) => `${step.order}. ${step.label} (${step.status}): ${step.detail}`);

  const section: PMFreakDemoNarrativeSection = {
    sectionId: PMFREAK_DEMO_NARRATIVE_SECTION_IDS.trace,
    kind: 'trace',
    title: 'Trace',
    summary: 'The trace below explains, in order, how Soberanía Enterprise evaluated this demo action before presenting a decision.',
    bullets,
    safeLabels: [],
    warnings: [],
  };

  assertNoPMFreakDemoNarrativeOverclaim(section);
  return section;
}
