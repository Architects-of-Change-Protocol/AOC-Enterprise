/**
 * AOC PMFreak Project Governance Scenario Pack v1 -- domain types.
 *
 * This module models what happens when a PMFreak project agent attempts an
 * action inside a realistic project-governance scenario: billing readiness,
 * milestone acceptance, schedule change, risk escalation, client
 * communication, and change control. It never re-implements passport,
 * runtime-guard, capability, evidence, or approval gating -- every scenario
 * run is decided by `resolvePMFreakAgentPassportAction` from
 * `@aoc-enterprise/pmfreak-agent-passport-foundation` (the real Agent
 * Passport Core wiring for PMFreak's six agent roles); this pack only
 * orchestrates scenarios around that resolver and projects its result into
 * scenario-shaped, claim-safe records.
 *
 * This is a deterministic demo domain model. It does not integrate with a
 * real PMFreak API, does not read or mutate real project, customer,
 * schedule, or billing data, and does not send real communications.
 */

import type {
  AgentRuntimeActionCategory,
} from '@aoc-enterprise/agent-governance';
import type {
  PMFreakAgentRole,
  PMFreakApprovalRequirementType,
  PMFreakApprovalRiskLevel,
  PMFreakAuthorityScope,
  PMFreakCapabilityTokenRiskLevel,
  PMFreakEvidenceRequirementType,
  PMFreakPassportActionDecision,
  PMFreakAgentPassportResolution,
  PMFreakProjectPhase,
} from '@aoc-enterprise/pmfreak-agent-passport-foundation';

export type { PMFreakAgentRole, PMFreakAuthorityScope, PMFreakPassportActionDecision, PMFreakAgentPassportResolution, PMFreakProjectPhase };

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
// Scenario action request template
// ---------------------------------------------------------------------------

/** The real `AgentRuntimeActionRequest` shape a scenario's primary action attempt declares. */
export interface PMFreakProjectGovernanceScenarioActionRequest {
  readonly actionId: string;
  readonly actionCategory: AgentRuntimeActionCategory;
  readonly toolName?: string;
  readonly dataCategories?: readonly string[];
}

/** Template for a `PMFreakCapabilityTokenMirror` -- `passportId` and `issuedAt` are filled in by the runner. */
export interface PMFreakProjectGovernanceScenarioCapabilityTokenTemplate {
  readonly id: string;
  readonly capability: string;
  readonly resourceScopes: readonly string[];
  readonly riskLevel: PMFreakCapabilityTokenRiskLevel;
}

/** Template for a `PMFreakEvidenceRequirementMirror` -- `passportId`/`role`/`status`/`createdAt` are filled in by the runner. */
export interface PMFreakProjectGovernanceScenarioEvidenceRequirementTemplate {
  readonly id: string;
  readonly type: PMFreakEvidenceRequirementType;
  readonly description: string;
}

/** Template for a `PMFreakApprovalRequirementMirror` -- `passportId`/`role` are filled in by the runner. */
export interface PMFreakProjectGovernanceScenarioApprovalRequirementTemplate {
  readonly id: string;
  readonly type: PMFreakApprovalRequirementType;
  readonly riskLevel: PMFreakApprovalRiskLevel;
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export type PMFreakProjectGovernanceScenarioCategory = 'billing_readiness' | 'milestone_acceptance' | 'schedule_change' | 'risk_escalation' | 'client_communication' | 'change_control';

/**
 * The subset of the real resolver's `context` input a scenario declares.
 * Every flag is passed through unchanged to `resolvePMFreakAgentPassportAction`
 * -- this pack never re-interprets or re-gates on these flags itself.
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

  /** Free-form display/actor identifier -- not a passport lookup key (the real passport is looked up by `primaryRole`). */
  readonly agentId: string;
  readonly primaryRole: PMFreakAgentRole;
  readonly action: PMFreakProjectGovernanceScenarioActionRequest;

  readonly projectContext: PMFreakDemoProjectContext;

  readonly capabilityToken: PMFreakProjectGovernanceScenarioCapabilityTokenTemplate;
  readonly evidenceRequirements: readonly PMFreakProjectGovernanceScenarioEvidenceRequirementTemplate[];
  readonly approvalRequirements: readonly PMFreakProjectGovernanceScenarioApprovalRequirementTemplate[];

  /** Evidence/approval requirement ids (from the two lists above) already collected/granted in this scenario's baseline run. */
  readonly baselineEvidenceIds: readonly string[];
  readonly baselineApprovalIds: readonly string[];

  readonly expectedDecision: PMFreakPassportActionDecision;

  readonly context: PMFreakProjectGovernanceScenarioContext;

  readonly safeNarrative: string;
}

// ---------------------------------------------------------------------------
// Scenario run input / result
// ---------------------------------------------------------------------------

export type PMFreakProjectGovernanceScenarioPassportVariant = 'active' | 'revoked' | 'suspended' | 'expired';

export interface RunPMFreakProjectGovernanceScenarioInput {
  readonly scenarioId: string;

  readonly overrideEvidenceIds?: readonly string[];
  readonly overrideApprovalIds?: readonly string[];

  /** Swaps the scenario's real passport for a same-role fixture transitioned to this status. */
  readonly overridePassportVariant?: PMFreakProjectGovernanceScenarioPassportVariant;
  /** Overrides the authority scope evaluated for this attempt -- e.g. to exercise an out-of-scope denial. */
  readonly overrideAuthorityScope?: PMFreakAuthorityScope;

  readonly overrideWorkspaceId?: string;
  readonly overrideProjectId?: string;
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

  /** Whether the scenario id resolved to a registered scenario. When false, every other field reflects a denied not-found attempt. */
  readonly scenarioFound: boolean;

  readonly actionAttemptId: string;

  readonly projectId: string;
  readonly workspaceId: string;
  readonly customerId?: string;

  readonly agentId: string;
  readonly role?: PMFreakAgentRole;
  readonly actionId: string;

  readonly decision: PMFreakPassportActionDecision;

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
  readonly role?: PMFreakAgentRole;
  readonly actionId: string;

  readonly decision: PMFreakPassportActionDecision;
  readonly passportStatus: PMFreakAgentPassportResolution['passportStatus'];

  readonly allowedByRuntimeGuard: boolean;
  readonly allowedByCapabilityToken: boolean;
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
  readonly role?: PMFreakAgentRole;
  readonly actionId: string;

  readonly passportResolution: PMFreakAgentPassportResolution;

  readonly decision: PMFreakPassportActionDecision;

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
