import type { PMFreakDemoControlPlaneDashboard } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_DISCLAIMERS, PMFREAK_DEMO_NARRATIVE_SAFE_LABELS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeDashboardExport, PMFreakDemoNarrativeDashboardScenarioSummary, PMFreakDemoNarrativeExportOptions } from './pmfreak-demo-narrative-export-types.js';

function buildDecisionSummary(dashboard: PMFreakDemoControlPlaneDashboard): string {
  const metrics = dashboard.summaryMetrics;
  return `${metrics.totalScenarios} demo scenarios evaluated: ${metrics.allowCount} allowed, ${metrics.holdCount} on hold, ${metrics.denyCount} denied, ${metrics.evidenceRequiredCount} evidence required, ${metrics.approvalRequiredCount} approval required.`;
}

function buildDashboardMarkdown(dashboardExport: PMFreakDemoNarrativeDashboardExport): string {
  const lines: string[] = [`# ${dashboardExport.title}`, '', dashboardExport.decisionSummary, ''];
  for (const summary of dashboardExport.scenarioSummaries) {
    lines.push(`- **${summary.scenarioTitle}** (\`${summary.scenarioId}\`): ${summary.decision} -- ${summary.summary}`);
  }
  lines.push('', '## Disclaimers', '');
  for (const disclaimer of dashboardExport.disclaimers) lines.push(`- ${disclaimer}`);
  return `${lines.join('\n').trim()}\n`;
}

function buildDashboardPlainText(dashboardExport: PMFreakDemoNarrativeDashboardExport): string {
  const lines: string[] = [dashboardExport.title.toUpperCase(), '', dashboardExport.decisionSummary, ''];
  for (const summary of dashboardExport.scenarioSummaries) {
    lines.push(`- ${summary.scenarioTitle} (${summary.scenarioId}): ${summary.decision} -- ${summary.summary}`);
  }
  lines.push('', 'DISCLAIMERS');
  for (const disclaimer of dashboardExport.disclaimers) lines.push(`- ${disclaimer}`);
  return `${lines.join('\n').trim()}\n`;
}

/**
 * Builds a claim-safe narrative dashboard export from an existing Control
 * Plane dashboard. Only summarizes `dashboard.viewModels`' already-computed
 * decisions and `dashboard.summaryMetrics` -- never re-runs a scenario,
 * never calls the passport resolver, and never mutates `dashboard`.
 */
export function createPMFreakDemoNarrativeDashboardExport(
  dashboard: PMFreakDemoControlPlaneDashboard,
  options: PMFreakDemoNarrativeExportOptions = {},
): PMFreakDemoNarrativeDashboardExport {
  const includeMarkdown = options.includeMarkdown ?? true;
  const includePlainText = options.includePlainText ?? true;

  const scenarioSummaries: PMFreakDemoNarrativeDashboardScenarioSummary[] = dashboard.viewModels.map((viewModel) => ({
    scenarioId: viewModel.scenarioId,
    scenarioTitle: viewModel.scenarioTitle,
    decision: viewModel.decisionBadge.decision,
    summary: viewModel.summary,
  }));

  const dashboardExportBase: PMFreakDemoNarrativeDashboardExport = {
    dashboardExportId: `aoc.export.demo.pmfreak.narrative.dashboard.${dashboard.dashboardId.replace(/\./g, '_')}.v1`,
    title: 'PMFreak Demo Narrative Dashboard',
    dashboardId: dashboard.dashboardId,
    totalScenarios: dashboard.summaryMetrics.totalScenarios,
    decisionSummary: buildDecisionSummary(dashboard),
    scenarioSummaries,
    safeLabels: PMFREAK_DEMO_NARRATIVE_SAFE_LABELS,
    disclaimers: PMFREAK_DEMO_NARRATIVE_DISCLAIMERS,
  };

  const markdown = includeMarkdown ? buildDashboardMarkdown(dashboardExportBase) : undefined;
  const plainText = includePlainText ? buildDashboardPlainText(dashboardExportBase) : undefined;

  const dashboardExport: PMFreakDemoNarrativeDashboardExport = {
    ...dashboardExportBase,
    ...(markdown !== undefined ? { markdown } : {}),
    ...(plainText !== undefined ? { plainText } : {}),
  };

  assertNoPMFreakDemoNarrativeOverclaim(dashboardExport);
  return dashboardExport;
}
