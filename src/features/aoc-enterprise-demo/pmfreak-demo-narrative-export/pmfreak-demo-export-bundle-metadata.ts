import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_ID, PMFREAK_DEMO_NARRATIVE_SECTION_IDS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeExportBundleMetadata, PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

/**
 * Builds the export bundle metadata from an existing Control Plane view
 * model and the sections already built for it. Only relabels
 * already-computed fields (policy/jurisdiction pack ids, trace presence) --
 * never claims legal validity, compliance certification, invoice-validity
 * certification, or customer-acceptance certification.
 */
export function createPMFreakDemoNarrativeExportBundleMetadata(
  viewModel: PMFreakDemoControlPlaneViewModel,
  sections: readonly PMFreakDemoNarrativeSection[],
): PMFreakDemoNarrativeExportBundleMetadata {
  const metadata: PMFreakDemoNarrativeExportBundleMetadata = {
    exportPackId: PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_ID,
    sourceViewId: viewModel.viewId,
    sourceScenarioId: viewModel.scenarioId,
    sourceDecision: viewModel.decisionBadge.decision,

    includedSections: sections.map((section) => section.sectionId),

    includedPolicyPackIds: viewModel.policyReferencePanel.appliedPolicyPackIds,
    includedJurisdictionPackIds: viewModel.policyReferencePanel.jurisdictionPackIds,

    includesTrace: viewModel.traceTimeline.steps.length > 0,
    includesEvidenceSummary: true,
    includesApprovalSummary: true,
    includesSafeInterpretation: true,
    includesDisclaimers: true,

    demoOnly: true,
    productionExecution: false,
    generatedBy: PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_ID,
  };

  assertNoPMFreakDemoNarrativeOverclaim(metadata);
  return metadata;
}

/**
 * Builds the export-metadata narrative section from already-built bundle
 * metadata. A pure presentation projection -- never a new computation.
 */
export function createPMFreakDemoExportMetadataSection(metadata: PMFreakDemoNarrativeExportBundleMetadata): PMFreakDemoNarrativeSection {
  const bullets = [
    `Export pack: ${metadata.exportPackId}`,
    `Source view: ${metadata.sourceViewId}`,
    `Source scenario: ${metadata.sourceScenarioId}`,
    `Included sections: ${metadata.includedSections.join(', ')}`,
    `Included policy packs: ${metadata.includedPolicyPackIds.length > 0 ? metadata.includedPolicyPackIds.join(', ') : 'none'}`,
    `Included jurisdiction packs: ${metadata.includedJurisdictionPackIds.length > 0 ? metadata.includedJurisdictionPackIds.join(', ') : 'none'}`,
    'Demo only. Not production execution.',
  ];

  const section: PMFreakDemoNarrativeSection = {
    sectionId: PMFREAK_DEMO_NARRATIVE_SECTION_IDS.exportMetadata,
    kind: 'export_metadata',
    title: 'Export Metadata',
    summary: 'This section presents the export bundle metadata for this demo narrative export. It carries no production execution claim.',
    bullets,
    safeLabels: ['Demo narrative export', 'Not production integration'],
    warnings: [],
  };

  assertNoPMFreakDemoNarrativeOverclaim(section);
  return section;
}
