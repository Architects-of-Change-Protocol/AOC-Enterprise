/**
 * AOC PMFreak Demo Narrative Export Pack v1 -- narrative export types.
 *
 * This module models presentation/export data only. It never redeclares
 * passport, authority-scope, capability, evidence, or approval gating, and
 * never redeclares a Control Plane badge, card, or panel -- every field
 * here is a direct or lightly-relabeled projection of a
 * `PMFreakDemoControlPlaneViewModel` (or a `PMFreakDemoControlPlaneComparison`
 * / `PMFreakDemoControlPlaneDashboard` built from one or more of them),
 * produced by the PMFreak Demo Control Plane View and, beneath that, the
 * PMFreak Project Governance Scenario Pack and PMFreak Agent Passport Demo
 * Pack.
 *
 * This is a deterministic demo narrative/export layer. It does not
 * integrate with a real PMFreak API, does not read or mutate real project,
 * customer, schedule, or billing data, and does not generate page-layout,
 * word-processor, email, or Slack/Teams artifacts.
 */

export type PMFreakDemoNarrativeSectionKind =
  | 'executive_summary'
  | 'agent_action'
  | 'governance_checks'
  | 'evidence'
  | 'approvals'
  | 'trace'
  | 'policy_references'
  | 'safe_interpretation'
  | 'next_steps'
  | 'export_metadata';

export interface PMFreakDemoNarrativeSection {
  readonly sectionId: string;
  readonly kind: PMFreakDemoNarrativeSectionKind;
  readonly title: string;
  readonly summary: string;
  readonly bullets: readonly string[];
  readonly safeLabels: readonly string[];
  readonly warnings: readonly string[];
}

export interface PMFreakDemoNarrativeExportDescriptor {
  readonly exportPackId: string;
  readonly exportPackName: string;
  readonly version: 'v1';
  readonly purpose: string;
  readonly sourceViewId: string;
  readonly demoOnly: true;
  readonly productionIntegration: false;
  readonly safeLabels: readonly string[];
  readonly disclaimers: readonly string[];
}

export interface PMFreakDemoNarrativeExportBundleMetadata {
  readonly exportPackId: string;
  readonly sourceViewId: string;
  readonly sourceScenarioId: string;
  readonly sourceDecision: string;

  readonly includedSections: readonly string[];

  readonly includedPolicyPackIds: readonly string[];
  readonly includedJurisdictionPackIds: readonly string[];

  readonly includesTrace: boolean;
  readonly includesEvidenceSummary: boolean;
  readonly includesApprovalSummary: boolean;
  readonly includesSafeInterpretation: boolean;
  readonly includesDisclaimers: boolean;

  readonly demoOnly: true;
  readonly productionExecution: false;
  readonly generatedBy: 'aoc.demo.pmfreak.narrative_export.v1';
}

export interface PMFreakDemoNarrativeExport {
  readonly exportId: string;
  readonly exportPackId: string;
  readonly exportPackName: string;

  readonly sourceViewId: string;
  readonly sourceScenarioId: string;
  readonly sourceScenarioTitle: string;

  readonly headline: string;
  readonly summary: string;

  readonly decision: string;
  readonly decisionLabel: string;
  readonly decisionSeverity: string;

  readonly sections: readonly PMFreakDemoNarrativeSection[];

  readonly exportBundleMetadata: PMFreakDemoNarrativeExportBundleMetadata;

  readonly markdown?: string;
  readonly plainText?: string;

  readonly safeLabels: readonly string[];
  readonly disclaimers: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export type PMFreakDemoNarrativeAudience = 'executive' | 'pm' | 'technical' | 'audit';

export interface PMFreakDemoNarrativeExportOptions {
  readonly includeMarkdown?: boolean;
  readonly includePlainText?: boolean;
  readonly includeDashboardContext?: boolean;
  readonly audience?: PMFreakDemoNarrativeAudience;
}

export interface PMFreakDemoNarrativeComparisonExport {
  readonly comparisonExportId: string;
  readonly title: string;
  readonly beforeExport: PMFreakDemoNarrativeExport;
  readonly afterExport: PMFreakDemoNarrativeExport;
  readonly changedDecision: boolean;
  readonly resolvedEvidenceIds: readonly string[];
  readonly resolvedApprovalIds: readonly string[];
  readonly explanation: string;
  readonly markdown?: string;
  readonly plainText?: string;
  readonly safeLabels: readonly string[];
  readonly disclaimers: readonly string[];
}

export interface PMFreakDemoNarrativeDashboardScenarioSummary {
  readonly scenarioId: string;
  readonly scenarioTitle: string;
  readonly decision: string;
  readonly summary: string;
}

export interface PMFreakDemoNarrativeDashboardExport {
  readonly dashboardExportId: string;
  readonly title: string;
  readonly dashboardId: string;
  readonly totalScenarios: number;
  readonly decisionSummary: string;
  readonly scenarioSummaries: readonly PMFreakDemoNarrativeDashboardScenarioSummary[];
  readonly markdown?: string;
  readonly plainText?: string;
  readonly safeLabels: readonly string[];
  readonly disclaimers: readonly string[];
}
