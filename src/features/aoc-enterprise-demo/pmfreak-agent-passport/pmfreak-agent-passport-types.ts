/**
 * AOC PMFreak Agent Passport Demo Pack v1 -- domain types.
 *
 * PMFreak is a project-management agent system. This module models PMFreak
 * agents as AOC-governed actors: they act only when they carry a valid,
 * non-revoked passport, a role-scoped authority, an active capability
 * token, sufficient evidence, and (where required) an approval -- never
 * because they are merely technically able to act.
 *
 * This is a deterministic demo domain model. It does not integrate with a
 * real PMFreak API, does not authenticate a real identity provider, and does
 * not read or mutate real project, customer, schedule, or billing data.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type PMFreakAgentRole = 'planning_agent' | 'risk_agent' | 'evidence_agent' | 'client_communication_agent' | 'billing_readiness_agent' | 'change_control_agent';

export interface PMFreakAgentRoleProfile {
  readonly role: PMFreakAgentRole;
  readonly displayName: string;
  readonly description: string;
  readonly allowedCapabilityIds: readonly string[];
  readonly restrictedCapabilityIds: readonly string[];
  readonly defaultApprovalRequirementIds: readonly string[];
  readonly defaultEvidenceRequirementIds: readonly string[];
  readonly safeOperatingNotes: readonly string[];
}

// ---------------------------------------------------------------------------
// Project phases and authority scope
// ---------------------------------------------------------------------------

export type PMFreakProjectPhase = 'initiation' | 'planning' | 'execution' | 'monitoring' | 'closure' | 'billing';

export interface PMFreakAuthorityScope {
  readonly workspaceIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly customerIds: readonly string[];
  readonly allowedProjectPhases: readonly PMFreakProjectPhase[];
  readonly maxRiskSeverityAllowedWithoutApproval: 'low' | 'medium' | 'high' | 'critical';
  readonly canDraftExternalCommunication: boolean;
  readonly canSendExternalCommunication: boolean;
  readonly canMarkMilestoneComplete: boolean;
  readonly canRecommendBillingReadiness: boolean;
  readonly canApproveBillingReadiness: boolean;
  readonly canModifySchedule: boolean;
  readonly canApproveScheduleChange: boolean;
  readonly canCreateChangeRequest: boolean;
  readonly canApproveChangeRequest: boolean;
}

// ---------------------------------------------------------------------------
// Passport
// ---------------------------------------------------------------------------

export type PMFreakAgentPassportStatus = 'draft' | 'active' | 'suspended' | 'revoked' | 'expired';

export interface PMFreakAgentPassport {
  readonly passportId: string;
  readonly agentId: string;
  readonly agentDisplayName: string;
  readonly systemId: 'pmfreak';
  readonly role: PMFreakAgentRole;

  readonly status: PMFreakAgentPassportStatus;

  readonly issuedBy: string;
  readonly issuedAt?: string;
  readonly expiresAt?: string;

  readonly authorityScope: PMFreakAuthorityScope;

  readonly capabilityTokenIds: readonly string[];

  readonly allowedActionIds: readonly string[];
  readonly restrictedActionIds: readonly string[];

  readonly defaultEvidenceRequirementIds: readonly string[];
  readonly defaultApprovalRequirementIds: readonly string[];

  readonly policyPackIds: readonly string[];

  readonly jurisdictionPackIds: readonly string[];

  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// Capability catalog
// ---------------------------------------------------------------------------

export type PMFreakCapabilityCategory = 'planning' | 'risk' | 'evidence' | 'communication' | 'billing' | 'change_control' | 'reporting';

export type PMFreakDecisionOnMissingEvidence = 'hold' | 'require_evidence' | 'require_pm_approval' | 'deny';

export interface PMFreakCapability {
  readonly capabilityId: string;
  readonly title: string;
  readonly description: string;
  readonly category: PMFreakCapabilityCategory;
  readonly requiresEvidence: boolean;
  readonly requiresApproval: boolean;
  readonly defaultDecisionOnMissingEvidence: PMFreakDecisionOnMissingEvidence;
}

// ---------------------------------------------------------------------------
// Action catalog
// ---------------------------------------------------------------------------

export type PMFreakActionCategory = 'schedule' | 'risk' | 'evidence' | 'communication' | 'billing' | 'change_control';

export type PMFreakActionSensitivity = 'low' | 'medium' | 'high' | 'critical';

export interface PMFreakAgentAction {
  readonly actionId: string;
  readonly capabilityId: string;
  readonly title: string;
  readonly description: string;
  readonly category: PMFreakActionCategory;
  readonly sensitivity: PMFreakActionSensitivity;
  readonly requiresEvidenceIds: readonly string[];
  readonly requiresApprovalIds: readonly string[];
  readonly restrictedByDefault: boolean;
}

// ---------------------------------------------------------------------------
// Evidence requirement catalog
// ---------------------------------------------------------------------------

export type PMFreakEvidenceType =
  | 'project_status_source'
  | 'schedule_baseline'
  | 'dependency_record'
  | 'risk_record'
  | 'mitigation_record'
  | 'deliverable_evidence'
  | 'customer_acceptance_record'
  | 'pm_approval_record'
  | 'change_request_record'
  | 'billing_milestone_record'
  | 'client_communication_draft'
  | 'meeting_minutes'
  | 'scope_statement'
  | 'contract_reference';

export interface PMFreakEvidenceRequirement {
  readonly evidenceRequirementId: string;
  readonly title: string;
  readonly description: string;
  readonly evidenceType: PMFreakEvidenceType;
  readonly required: boolean;
}

// ---------------------------------------------------------------------------
// Approval requirement catalog
// ---------------------------------------------------------------------------

export type PMFreakApprovalType = 'pm_approval' | 'project_sponsor_approval' | 'customer_validation' | 'commercial_review' | 'contract_review' | 'billing_review' | 'legal_review' | 'security_review' | 'executive_approval';

export interface PMFreakApprovalRequirement {
  readonly approvalRequirementId: string;
  readonly title: string;
  readonly description: string;
  readonly approvalType: PMFreakApprovalType;
  readonly required: boolean;
}

// ---------------------------------------------------------------------------
// Resolver input / output
// ---------------------------------------------------------------------------

export interface ResolvePMFreakAgentPassportActionInput {
  readonly actionAttemptId: string;
  readonly agentId: string;
  readonly passportId: string;
  readonly actionId: string;

  readonly workspaceId: string;
  readonly projectId: string;
  readonly customerId?: string;

  readonly projectPhase: PMFreakProjectPhase;

  readonly evidenceIds: readonly string[];
  readonly approvalIds: readonly string[];

  readonly jurisdictionCountryCode?: string;

  readonly policyPackIds?: readonly string[];

  readonly requestedAt?: string;

  readonly context?: {
    readonly customerFacing?: boolean;
    readonly billingSensitive?: boolean;
    readonly contractSensitive?: boolean;
    readonly scheduleSensitive?: boolean;
    readonly legalSensitive?: boolean;
    readonly externalCommunication?: boolean;
    readonly customerCommitment?: boolean;
    readonly projectClosureSensitive?: boolean;
  };
}

export type PMFreakAgentPassportDecision =
  | 'allow'
  | 'hold'
  | 'deny'
  | 'require_evidence'
  | 'require_pm_approval'
  | 'require_customer_validation'
  | 'require_contract_review'
  | 'require_billing_review'
  | 'require_legal_review'
  | 'require_security_review'
  | 'require_executive_approval';

export interface PMFreakAgentPassportResolution {
  readonly actionAttemptId: string;
  readonly agentId: string;
  readonly passportId: string;
  readonly actionId: string;

  /**
   * The passport's role, when a passport was found. Not part of the PR's
   * literal resolution shape, but carried here (optional, additive) so that
   * `createPMFreakAgentPassportControlPlaneSummary` and
   * `createPMFreakAgentPassportExportMetadata` -- which by design take only
   * a `resolution` -- can still surface the acting role without a second
   * registry lookup.
   */
  readonly role?: PMFreakAgentRole;

  readonly passportStatus: PMFreakAgentPassportStatus;

  readonly decision: PMFreakAgentPassportDecision;

  readonly allowedByPassport: boolean;
  readonly allowedByCapability: boolean;
  readonly allowedByAuthorityScope: boolean;
  readonly evidenceSatisfied: boolean;
  readonly approvalsSatisfied: boolean;

  readonly missingEvidenceIds: readonly string[];
  readonly missingApprovalIds: readonly string[];

  readonly requiredEvidenceIds: readonly string[];
  readonly requiredApprovalIds: readonly string[];

  readonly appliedPolicyPackIds: readonly string[];
  readonly jurisdictionPackIds: readonly string[];

  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

// ---------------------------------------------------------------------------
// Passport registry
// ---------------------------------------------------------------------------

export interface PMFreakAgentPassportRegistry {
  readonly passports: readonly PMFreakAgentPassport[];
  findByPassportId(passportId: string): PMFreakAgentPassport | undefined;
  findByAgentId(agentId: string): readonly PMFreakAgentPassport[];
  findActiveByAgentId(agentId: string): readonly PMFreakAgentPassport[];
  findByRole(role: PMFreakAgentRole): readonly PMFreakAgentPassport[];
}

// ---------------------------------------------------------------------------
// Control Plane summary / export metadata
// ---------------------------------------------------------------------------

export interface PMFreakAgentPassportControlPlaneSummary {
  readonly agentId: string;
  readonly passportId: string;
  readonly role?: PMFreakAgentRole;
  readonly passportStatus: PMFreakAgentPassportStatus;
  readonly attemptedActionId: string;
  readonly decision: PMFreakAgentPassportDecision;
  readonly allowedByPassport: boolean;
  readonly allowedByCapability: boolean;
  readonly allowedByAuthorityScope: boolean;
  readonly evidenceSatisfied: boolean;
  readonly approvalsSatisfied: boolean;
  readonly missingEvidenceIds: readonly string[];
  readonly missingApprovalIds: readonly string[];
  readonly appliedPolicyPackIds: readonly string[];
  readonly jurisdictionPackIds: readonly string[];
  readonly safeDisplayLabels: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface PMFreakAgentPassportExportMetadata {
  readonly packId: string;
  readonly exportId: string;
  readonly agentId: string;
  readonly passportId: string;
  readonly role?: PMFreakAgentRole;
  readonly passportStatus: PMFreakAgentPassportStatus;
  readonly attemptedActionId: string;
  readonly decision: PMFreakAgentPassportDecision;
  readonly requiredEvidenceIds: readonly string[];
  readonly missingEvidenceIds: readonly string[];
  readonly requiredApprovalIds: readonly string[];
  readonly missingApprovalIds: readonly string[];
  readonly allowedByAuthorityScope: boolean;
  readonly appliedPolicyPackIds: readonly string[];
  readonly jurisdictionPackIds: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly safeFraming: {
    readonly notLegalAdvice: true;
    readonly notComplianceCertification: true;
    readonly noCompletenessClaim: true;
    readonly demoOnly: true;
  };
}
