import type { PMFreakAgentRole, PMFreakPassportActionDecision } from '@aoc-enterprise/pmfreak-agent-passport-foundation';
import type { PMFreakProjectGovernanceScenarioCategory } from '../pmfreak-project-governance-scenarios/index.js';

/**
 * AOC PMFreak Demo Control Plane View v1 -- view-model types.
 *
 * This module models presentation-ready data only. It never redeclares
 * passport, authority-scope, capability, evidence, or approval gating --
 * every field here is a direct or lightly-relabeled projection of a
 * `PMFreakProjectGovernanceScenarioRunResult` (and the
 * `PMFreakAgentPassportResolution` it carries), produced by the PMFreak
 * Project Governance Scenario Pack and, beneath that, the PMFreak Agent
 * Passport Demo Pack.
 *
 * This is a deterministic demo view-model layer. It does not integrate with
 * a real PMFreak API, does not read or mutate real project, customer,
 * schedule, or billing data, and does not render UI.
 */

export type PMFreakDemoDecisionSeverity = 'success' | 'info' | 'warning' | 'danger';

export interface PMFreakDemoDecisionBadge {
  readonly decision: PMFreakPassportActionDecision;
  readonly severity: PMFreakDemoDecisionSeverity;
  readonly label: string;
  readonly description: string;
}

export type PMFreakDemoCapabilityTokenStatus = 'satisfied' | 'missing' | 'not_applicable';
export type PMFreakDemoAuthorityStatus = 'satisfied' | 'failed' | 'not_applicable';

export interface PMFreakDemoAgentPassportCard {
  readonly agentId: string;
  readonly passportId: string;
  readonly role?: PMFreakAgentRole;
  readonly passportStatus: string;
  readonly statusLabel: string;
  readonly statusSeverity: PMFreakDemoDecisionSeverity;
  readonly allowedByRuntimeGuard: boolean;
  readonly allowedByCapabilityToken: boolean;
  readonly allowedByAuthorityScope: boolean;
  readonly capabilityTokenStatus: PMFreakDemoCapabilityTokenStatus;
  readonly authorityStatus: PMFreakDemoAuthorityStatus;
  readonly notes: readonly string[];
}

export interface PMFreakDemoAttemptedActionCard {
  readonly actionAttemptId: string;
  readonly actionId: string;
  readonly actionLabel: string;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly customerId?: string;
  readonly scenarioCategory: PMFreakProjectGovernanceScenarioCategory;
  readonly contextFlags: readonly string[];
  readonly safeDescription: string;
}

export type PMFreakDemoPanelFindingStatus = 'passed' | 'failed' | 'warning' | 'not_applicable';

export interface PMFreakDemoPanelFinding {
  readonly id: string;
  readonly label: string;
  readonly status: PMFreakDemoPanelFindingStatus;
  readonly detail: string;
}

export type PMFreakDemoGateStatus = 'satisfied' | 'failed' | 'not_applicable';

export interface PMFreakDemoAuthorityScopePanel {
  readonly allowedByAuthorityScope: boolean;
  readonly workspaceChecked: boolean;
  readonly projectChecked: boolean;
  readonly customerChecked: boolean;
  readonly phaseChecked: boolean;
  readonly status: PMFreakDemoGateStatus;
  readonly findings: readonly PMFreakDemoPanelFinding[];
}

export interface PMFreakDemoEvidencePanel {
  readonly evidenceSatisfied: boolean;
  readonly requiredEvidenceIds: readonly string[];
  readonly missingEvidenceIds: readonly string[];
  readonly providedEvidenceIds: readonly string[];
  readonly findings: readonly PMFreakDemoPanelFinding[];
}

export interface PMFreakDemoApprovalPanel {
  readonly approvalsSatisfied: boolean;
  readonly requiredApprovalIds: readonly string[];
  readonly missingApprovalIds: readonly string[];
  readonly providedApprovalIds: readonly string[];
  readonly findings: readonly PMFreakDemoPanelFinding[];
}

export type PMFreakDemoTraceTimelineStepStatus = 'passed' | 'failed' | 'warning' | 'not_applicable';

export interface PMFreakDemoTraceTimelineStep {
  readonly stepId: string;
  readonly label: string;
  readonly status: PMFreakDemoTraceTimelineStepStatus;
  readonly detail: string;
  readonly order: number;
}

export interface PMFreakDemoTraceTimeline {
  readonly steps: readonly PMFreakDemoTraceTimelineStep[];
}

export interface PMFreakDemoPolicyReferencePanel {
  readonly appliedPolicyPackIds: readonly string[];
  readonly jurisdictionPackIds: readonly string[];
  readonly jurisdictionContextLabel?: string;
  readonly findings: readonly PMFreakDemoPanelFinding[];
}

export interface PMFreakDemoExportPanel {
  readonly exportReady: boolean;
  readonly exportLabel: string;
  readonly exportMetadataAvailable: boolean;
  readonly traceIncluded: boolean;
  readonly warningsIncluded: boolean;
  readonly errorsIncluded: boolean;
  readonly safeFramingIncluded: boolean;
  readonly findings: readonly PMFreakDemoPanelFinding[];
}

export interface PMFreakDemoControlPlaneViewModel {
  readonly viewId: string;
  readonly viewName: string;

  readonly scenarioId: string;
  readonly scenarioTitle: string;
  readonly scenarioCategory: PMFreakProjectGovernanceScenarioCategory;

  readonly headline: string;
  readonly summary: string;

  readonly decisionBadge: PMFreakDemoDecisionBadge;

  readonly agentPassportCard: PMFreakDemoAgentPassportCard;
  readonly attemptedActionCard: PMFreakDemoAttemptedActionCard;

  readonly authorityScopePanel: PMFreakDemoAuthorityScopePanel;
  readonly evidencePanel: PMFreakDemoEvidencePanel;
  readonly approvalPanel: PMFreakDemoApprovalPanel;
  readonly traceTimeline: PMFreakDemoTraceTimeline;
  readonly policyReferencePanel: PMFreakDemoPolicyReferencePanel;
  readonly exportPanel: PMFreakDemoExportPanel;

  readonly safeLabels: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface PMFreakDemoControlPlaneDashboardMetrics {
  readonly totalScenarios: number;
  readonly allowCount: number;
  readonly holdCount: number;
  readonly denyCount: number;
  readonly reviewRequiredCount: number;
  readonly evidenceRequiredCount: number;
  readonly approvalRequiredCount: number;
}

export interface PMFreakDemoControlPlaneDashboard {
  readonly dashboardId: string;
  readonly title: string;
  readonly description: string;
  readonly primaryScenarioId: string;
  readonly viewModels: readonly PMFreakDemoControlPlaneViewModel[];
  readonly summaryMetrics: PMFreakDemoControlPlaneDashboardMetrics;
  readonly safeLabels: readonly string[];
}

export interface PMFreakDemoControlPlaneComparison {
  readonly comparisonId: string;
  readonly title: string;
  readonly before: PMFreakDemoControlPlaneViewModel;
  readonly after: PMFreakDemoControlPlaneViewModel;
  readonly changedDecision: boolean;
  readonly resolvedEvidenceIds: readonly string[];
  readonly resolvedApprovalIds: readonly string[];
  readonly explanation: string;
}
