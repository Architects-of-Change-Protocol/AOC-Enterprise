import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_DISCLAIMERS, PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_ID, PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_NAME, PMFREAK_DEMO_NARRATIVE_SAFE_LABELS } from './pmfreak-demo-narrative-export-constants.js';
import { createPMFreakDemoExecutiveSummarySection } from './pmfreak-demo-executive-summary.js';
import { createPMFreakDemoAgentActionSection } from './pmfreak-demo-agent-action-narrative.js';
import { createPMFreakDemoGovernanceChecksSection } from './pmfreak-demo-governance-checks-narrative.js';
import { createPMFreakDemoEvidenceNarrativeSection } from './pmfreak-demo-evidence-narrative.js';
import { createPMFreakDemoApprovalNarrativeSection } from './pmfreak-demo-approval-narrative.js';
import { createPMFreakDemoTraceNarrativeSection } from './pmfreak-demo-trace-narrative.js';
import { createPMFreakDemoPolicyReferenceNarrativeSection } from './pmfreak-demo-policy-reference-narrative.js';
import { createPMFreakDemoSafeInterpretationSection } from './pmfreak-demo-safe-interpretation.js';
import { createPMFreakDemoNextStepsSection } from './pmfreak-demo-next-steps.js';
import { createPMFreakDemoExportMetadataSection, createPMFreakDemoNarrativeExportBundleMetadata } from './pmfreak-demo-export-bundle-metadata.js';
import { renderPMFreakDemoNarrativeMarkdown } from './pmfreak-demo-markdown-renderer.js';
import { renderPMFreakDemoNarrativePlainText } from './pmfreak-demo-plain-text-renderer.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeExport, PMFreakDemoNarrativeExportOptions, PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

function buildExportId(scenarioId: string): string {
  const scenarioIdSafe = scenarioId.replace(/\./g, '_');
  return `aoc.export.demo.pmfreak.narrative.${scenarioIdSafe}.v1`;
}

/**
 * Builds a deterministic, claim-safe narrative export from an existing
 * Control Plane view model.
 *
 * This is a pure presentation/export projection. It never calls
 * `resolvePMFreakAgentPassportAction`, `runPMFreakProjectGovernanceScenario`,
 * or `createPMFreakDemoControlPlaneViewModel` itself, never recomputes a
 * passport, capability, authority-scope, evidence, approval, or decision
 * badge, and never mutates `viewModel`.
 */
export function createPMFreakDemoNarrativeExport(viewModel: PMFreakDemoControlPlaneViewModel, options: PMFreakDemoNarrativeExportOptions = {}): PMFreakDemoNarrativeExport {
  const includeMarkdown = options.includeMarkdown ?? true;
  const includePlainText = options.includePlainText ?? true;

  const sections: PMFreakDemoNarrativeSection[] = [
    createPMFreakDemoExecutiveSummarySection(viewModel),
    createPMFreakDemoAgentActionSection(viewModel),
    createPMFreakDemoGovernanceChecksSection(viewModel),
    createPMFreakDemoEvidenceNarrativeSection(viewModel),
    createPMFreakDemoApprovalNarrativeSection(viewModel),
    createPMFreakDemoTraceNarrativeSection(viewModel),
    createPMFreakDemoPolicyReferenceNarrativeSection(viewModel),
    createPMFreakDemoSafeInterpretationSection(viewModel),
    createPMFreakDemoNextStepsSection(viewModel),
  ];

  const exportBundleMetadata = createPMFreakDemoNarrativeExportBundleMetadata(viewModel, sections);
  sections.push(createPMFreakDemoExportMetadataSection(exportBundleMetadata));

  const narrativeExportBase: PMFreakDemoNarrativeExport = {
    exportId: buildExportId(viewModel.scenarioId),
    exportPackId: PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_ID,
    exportPackName: PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_NAME,

    sourceViewId: viewModel.viewId,
    sourceScenarioId: viewModel.scenarioId,
    sourceScenarioTitle: viewModel.scenarioTitle,

    headline: viewModel.headline,
    summary: viewModel.summary,

    decision: viewModel.decisionBadge.decision,
    decisionLabel: viewModel.decisionBadge.label,
    decisionSeverity: viewModel.decisionBadge.severity,

    sections,

    exportBundleMetadata,

    safeLabels: PMFREAK_DEMO_NARRATIVE_SAFE_LABELS,
    disclaimers: PMFREAK_DEMO_NARRATIVE_DISCLAIMERS,
    warnings: viewModel.warnings,
    errors: viewModel.errors,
  };

  const markdown = includeMarkdown ? renderPMFreakDemoNarrativeMarkdown(narrativeExportBase) : undefined;
  const plainText = includePlainText ? renderPMFreakDemoNarrativePlainText(narrativeExportBase) : undefined;

  const narrativeExport: PMFreakDemoNarrativeExport = {
    ...narrativeExportBase,
    ...(markdown !== undefined ? { markdown } : {}),
    ...(plainText !== undefined ? { plainText } : {}),
  };

  assertNoPMFreakDemoNarrativeOverclaim(narrativeExport);
  return narrativeExport;
}
