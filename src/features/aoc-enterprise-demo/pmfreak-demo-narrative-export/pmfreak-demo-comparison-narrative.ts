import type { PMFreakDemoControlPlaneComparison } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_DISCLAIMERS, PMFREAK_DEMO_NARRATIVE_SAFE_LABELS } from './pmfreak-demo-narrative-export-constants.js';
import { createPMFreakDemoNarrativeExport } from './pmfreak-demo-narrative-builder.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeComparisonExport, PMFreakDemoNarrativeExportOptions } from './pmfreak-demo-narrative-export-types.js';

function buildComparisonMarkdown(comparison: PMFreakDemoNarrativeComparisonExport): string {
  const lines: string[] = [
    `# ${comparison.title}`,
    '',
    comparison.explanation,
    '',
    '## Before',
    '',
    comparison.beforeExport.markdown ?? comparison.beforeExport.summary,
    '',
    '## After',
    '',
    comparison.afterExport.markdown ?? comparison.afterExport.summary,
  ];
  return `${lines.join('\n').trim()}\n`;
}

function buildComparisonPlainText(comparison: PMFreakDemoNarrativeComparisonExport): string {
  const lines: string[] = [
    comparison.title.toUpperCase(),
    '',
    comparison.explanation,
    '',
    'BEFORE',
    comparison.beforeExport.plainText ?? comparison.beforeExport.summary,
    '',
    'AFTER',
    comparison.afterExport.plainText ?? comparison.afterExport.summary,
  ];
  return `${lines.join('\n').trim()}\n`;
}

/**
 * Builds a claim-safe before/after narrative comparison export from an
 * existing Control Plane comparison. Only wraps two already-built narrative
 * exports and reuses the comparison's own `explanation`, `changedDecision`,
 * `resolvedEvidenceIds`, and `resolvedApprovalIds` -- never re-derives a
 * decision, never re-diffs evidence or approval ids, and never mutates
 * `comparison`.
 */
export function createPMFreakDemoNarrativeComparisonExport(
  comparison: PMFreakDemoControlPlaneComparison,
  options: PMFreakDemoNarrativeExportOptions = {},
): PMFreakDemoNarrativeComparisonExport {
  const beforeExport = createPMFreakDemoNarrativeExport(comparison.before, options);
  const afterExport = createPMFreakDemoNarrativeExport(comparison.after, options);

  const includeMarkdown = options.includeMarkdown ?? true;
  const includePlainText = options.includePlainText ?? true;

  const comparisonExportBase: PMFreakDemoNarrativeComparisonExport = {
    comparisonExportId: `aoc.export.demo.pmfreak.narrative.comparison.${comparison.before.scenarioId.replace(/\./g, '_')}.vs.${comparison.after.scenarioId.replace(/\./g, '_')}.v1`,
    title: `Comparison: ${comparison.title}`,
    beforeExport,
    afterExport,
    changedDecision: comparison.changedDecision,
    resolvedEvidenceIds: comparison.resolvedEvidenceIds,
    resolvedApprovalIds: comparison.resolvedApprovalIds,
    explanation: comparison.explanation,
    safeLabels: PMFREAK_DEMO_NARRATIVE_SAFE_LABELS,
    disclaimers: PMFREAK_DEMO_NARRATIVE_DISCLAIMERS,
  };

  const markdown = includeMarkdown ? buildComparisonMarkdown(comparisonExportBase) : undefined;
  const plainText = includePlainText ? buildComparisonPlainText(comparisonExportBase) : undefined;

  const comparisonExport: PMFreakDemoNarrativeComparisonExport = {
    ...comparisonExportBase,
    ...(markdown !== undefined ? { markdown } : {}),
    ...(plainText !== undefined ? { plainText } : {}),
  };

  assertNoPMFreakDemoNarrativeOverclaim(comparisonExport);
  return comparisonExport;
}
