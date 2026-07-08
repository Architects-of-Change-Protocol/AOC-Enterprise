/**
 * AOC PMFreak Project Governance Scenario Pack v1 -- domain types.
 *
 * This module models what happens when a PMFreak project agent attempts an
 * action inside a realistic project-governance scenario: billing readiness,
 * milestone acceptance, schedule change, risk escalation, client
 * communication, and change control. It never re-implements passport,
 * authority-scope, capability, evidence, or approval gating -- every
 * scenario run is decided by `resolvePMFreakAgentPassportAction` from the
 * PMFreak Agent Passport Demo Pack; this pack only orchestrates scenarios
 * around that resolver and projects its result into scenario-shaped,
 * claim-safe records.
 *
 * This is a deterministic demo domain model. It does not integrate with a
 * real PMFreak API, does not read or mutate real project, customer,
 * schedule, or billing data, and does not send real communications.
 */

import type { PMFreakAgentPassportDecision, PMFreakAgentPassportResolution, PMFreakProjectPhase } from '../pmfreak-agent-passport/index.js';

// ---------------------------------------------------------------------------
// Demo project context
// ---------------------------------------------------------------------------

export type PMFreakDemoProjectStatus = 'draft' | 'active' | 'at_risk' | 'blocked' | 'pending_acceptance' | 'ready_for_billing_review' | 'closed';

export interface PMFreakDemoProjectContext {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly customerId: string;
  readonly customerDisplayName: string;

  readonly phase: PMFreakProjectPhase;

  readonly status: PMFreakDemoProjectStatus;

  readonly jurisdictionCountryCode?: string;

  readonly policyPackIds: readonly string[];
  readonly jurisdictionPackIds: readonly string[];

  readonly milestoneIds: readonly string[];
  readonly riskIds: readonly string[];
  readonly changeRequestIds: readonly string[];

  readonly evidenceIds: readonly string[];
  readonly approvalIds: readonly string[];

  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// Demo milestone
// ---------------------------------------------------------------------------

export type PMFreakDemoMilestoneStatus = 'not_started' | 'in_progress' | 'delivered' | 'pending_acceptance' | 'accepted' | 'billing_review' | 'billing_ready' | 'blocked';

export interface PMFreakDemoMilestone {
  readonly milestoneId: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: PMFreakDemoMilestoneStatus;
  readonly requiredEvidenceIds: readonly string[];
  readonly requiredApprovalIds: readonly string[];
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// Demo risk
// ---------------------------------------------------------------------------

export type PMFreakDemoRiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PMFreakDemoRisk {
  readonly riskId: string;
  readonly projectId: string;
  readonly title: string;
  readonly severity: PMFreakDemoRiskSeverity;
  readonly status: 'open' | 'mitigating' | 'escalated' | 'closed';
  readonly requiredEvidenceIds: readonly string[];
  readonly requiredApprovalIds: readonly string[];
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// Demo change request
// ---------------------------------------------------------------------------

export type PMFreakDemoChangeRequestStatus = 'draft' | 'classified' | 'pending_pm_review' | 'pending_customer_validation' | 'approved' | 'rejected';

export type PMFreakDemoChangeRequestImpactArea = 'scope' | 'schedule' | 'budget' | 'billing' | 'contract' | 'security';

export interface PMFreakDemoChangeRequest {
  readonly changeRequestId: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: PMFreakDemoChangeRequestStatus;
  readonly impactAreas: readonly PMFreakDemoChangeRequestImpactArea[];
  readonly requiredEvidenceIds: readonly string[];
  readonly requiredApprovalIds: readonly string[];
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export type PMFreakProjectGovernanceScenarioCategory = 'billing_readiness' | 'milestone_acceptance' | 'schedule_change' | 'risk_escalation' | 'client_communication' | 'change_control';

/**
 * The subset of `ResolvePMFreakAgentPassportActionInput['context']` a
 * scenario declares. Every flag is passed through unchanged to
 * `resolvePMFreakAgentPassportAction` -- this pack never re-interprets or
 * re-gates on these flags itself.
 */
export interface PMFreakProjectGovernanceScenarioContext {
  readonly customerFacing?: boolean;
  readonly billingSensitive?: boolean;
  readonly contractSensitive?: boolean;
  readonly scheduleSensitive?: boolean;
  readonly legalSensitive?: boolean;
  readonly externalCommunication?: boolean;
  readonly customerCommitment?: boolean;
  readonly projectClosureSensitive?: boolean;
}

export interface PMFreakProjectGovernanceScenario {
  readonly scenarioId: string;
  readonly title: string;
  readonly description: string;
  readonly category: PMFreakProjectGovernanceScenarioCategory;

  readonly primaryAgentId: string;
  readonly primaryPassportId: string;
  readonly primaryActionId: string;

  readonly projectContext: PMFreakDemoProjectContext;

  readonly requiredEvidenceIds: readonly string[];
  readonly requiredApprovalIds: readonly string[];

  readonly expectedDecision: PMFreakAgentPassportDecision;

  readonly context: PMFreakProjectGovernanceScenarioContext;

  readonly safeNarrative: string;
}

// ---------------------------------------------------------------------------
// Scenario run input / result
// ---------------------------------------------------------------------------

export interface RunPMFreakProjectGovernanceScenarioInput {
  readonly scenarioId: string;

  readonly overrideEvidenceIds?: readonly string[];
  readonly overrideApprovalIds?: readonly string[];
  readonly overridePassportId?: string;
  readonly overrideAgentId?: string;
  readonly overrideProjectId?: string;
  readonly overrideWorkspaceId?: string;
  readonly overrideCustomerId?: string;

  readonly requestedAt?: string;
}

export type PMFreakProjectGovernanceScenarioTraceStepStatus = 'passed' | 'failed' | 'warning' | 'not_applicable';

export interface PMFreakProjectGovernanceScenarioTraceStep {
  readonly stepId: string;
  readonly title: string;
  readonly status: PMFreakProjectGovernanceScenarioTraceStepStatus;
  readonly detail: string;
}

export interface PMFreakProjectGovernanceScenarioRunResult {
  readonly scenarioId: string;
  readonly scenarioTitle: string;
  readonly category: PMFreakProjectGovernanceScenarioCategory;

  readonly actionAttemptId: string;

  readonly projectId: string;
  readonly workspaceId: string;
  readonly customerId?: string;

  readonly agentId: string;
  readonly passportId: string;
  readonly actionId: string;

  readonly decision: PMFreakAgentPassportDecision;

  readonly passportResolution: PMFreakAgentPassportResolution;

  readonly evidenceSatisfied: boolean;
  readonly approvalsSatisfied: boolean;

  readonly missingEvidenceIds: readonly string[];
  readonly missingApprovalIds: readonly string[];

  readonly appliedPolicyPackIds: readonly string[];
  readonly jurisdictionPackIds: readonly string[];

  readonly scenarioTrace: readonly PMFreakProjectGovernanceScenarioTraceStep[];

  readonly safeNarrative: string;

  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

// ---------------------------------------------------------------------------
// Scenario registry
// ---------------------------------------------------------------------------

export interface PMFreakProjectGovernanceScenarioRegistry {
  readonly scenarios: readonly PMFreakProjectGovernanceScenario[];
  findByScenarioId(scenarioId: string): PMFreakProjectGovernanceScenario | undefined;
  findByCategory(category: PMFreakProjectGovernanceScenarioCategory): readonly PMFreakProjectGovernanceScenario[];
  listScenarioIds(): readonly string[];
}

// ---------------------------------------------------------------------------
// Control Plane summary / export metadata
// ---------------------------------------------------------------------------

export interface PMFreakProjectGovernanceScenarioControlPlaneSummary {
  readonly scenarioId: string;
  readonly scenarioTitle: string;
  readonly category: PMFreakProjectGovernanceScenarioCategory;

  readonly projectId: string;
  readonly workspaceId: string;
  readonly customerId?: string;

  readonly agentId: string;
  readonly passportId: string;
  readonly actionId: string;

  readonly decision: PMFreakAgentPassportDecision;
  readonly passportStatus: PMFreakAgentPassportResolution['passportStatus'];

  readonly allowedByPassport: boolean;
  readonly allowedByCapability: boolean;
  readonly allowedByAuthorityScope: boolean;
  readonly evidenceSatisfied: boolean;
  readonly approvalsSatisfied: boolean;

  readonly missingEvidenceIds: readonly string[];
  readonly missingApprovalIds: readonly string[];

  readonly appliedPolicyPackIds: readonly string[];
  readonly jurisdictionPackIds: readonly string[];

  readonly scenarioTrace: readonly PMFreakProjectGovernanceScenarioTraceStep[];

  readonly safeDisplayLabels: readonly string[];

  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface PMFreakProjectGovernanceScenarioExportMetadata {
  readonly packId: string;
  readonly exportId: string;

  readonly scenarioId: string;
  readonly scenarioTitle: string;
  readonly category: PMFreakProjectGovernanceScenarioCategory;

  readonly projectContext: PMFreakDemoProjectContext;

  readonly agentId: string;
  readonly passportId: string;
  readonly actionId: string;

  readonly passportResolution: PMFreakAgentPassportResolution;

  readonly decision: PMFreakAgentPassportDecision;

  readonly requiredEvidenceIds: readonly string[];
  readonly missingEvidenceIds: readonly string[];
  readonly requiredApprovalIds: readonly string[];
  readonly missingApprovalIds: readonly string[];

  readonly appliedPolicyPackIds: readonly string[];
  readonly jurisdictionPackIds: readonly string[];

  readonly scenarioTrace: readonly PMFreakProjectGovernanceScenarioTraceStep[];

  readonly warnings: readonly string[];
  readonly errors: readonly string[];

  readonly safeFraming: {
    readonly notLegalAdvice: true;
    readonly notComplianceCertification: true;
    readonly noCompletenessClaim: true;
    readonly demoOnly: true;
  };
}
