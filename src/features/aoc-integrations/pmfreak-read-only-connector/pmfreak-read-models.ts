/**
 * AOC PMFreak Read-Only Connector v1 -- typed read models.
 *
 * These are connector snapshots of PMFreak data, not AOC governance models.
 * Reading a record here implies nothing about governance approval, evidence
 * certification, approval validity, or compliance status -- it is only a
 * normalized, safe-to-pass-around read.
 */

export type AocPMFreakProjectStatus =
  | 'draft'
  | 'active'
  | 'at_risk'
  | 'blocked'
  | 'pending_acceptance'
  | 'ready_for_billing_review'
  | 'closed'
  | 'unknown';

export type AocPMFreakProjectPhase = 'initiation' | 'planning' | 'execution' | 'monitoring' | 'closure' | 'billing' | 'unknown';

export interface AocPMFreakProjectReadModel {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly tenantId?: string;
  readonly customerId?: string;

  readonly projectName?: string;

  readonly projectStatus?: AocPMFreakProjectStatus;
  readonly phase?: AocPMFreakProjectPhase;

  readonly milestoneIds: readonly string[];
  readonly taskIds: readonly string[];
  readonly riskIds: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly approvalReferenceIds: readonly string[];
  readonly actionProposalIds: readonly string[];

  readonly sourceUpdatedAt?: string;
  readonly sourceUrl?: string;

  readonly metadata: Readonly<Record<string, unknown>>;
}

export type AocPMFreakAgentRole =
  | 'planning_agent'
  | 'risk_agent'
  | 'evidence_agent'
  | 'client_communication_agent'
  | 'billing_readiness_agent'
  | 'change_control_agent'
  | 'unknown';

export type AocPMFreakAgentStatus = 'active' | 'inactive' | 'suspended' | 'unknown';

export interface AocPMFreakAgentReadModel {
  readonly agentId: string;
  readonly agentDisplayName?: string;

  readonly role?: AocPMFreakAgentRole;
  readonly status?: AocPMFreakAgentStatus;

  readonly workspaceIds: readonly string[];
  readonly projectIds: readonly string[];

  readonly sourceUpdatedAt?: string;

  readonly metadata: Readonly<Record<string, unknown>>;
}

export type AocPMFreakMilestoneStatus =
  | 'not_started'
  | 'in_progress'
  | 'delivered'
  | 'pending_acceptance'
  | 'accepted'
  | 'billing_review'
  | 'billing_ready'
  | 'blocked'
  | 'unknown';

export interface AocPMFreakMilestoneReadModel {
  readonly milestoneId: string;
  readonly projectId: string;
  readonly title?: string;

  readonly status?: AocPMFreakMilestoneStatus;

  readonly evidenceReferenceIds: readonly string[];
  readonly approvalReferenceIds: readonly string[];

  readonly sourceUpdatedAt?: string;

  readonly metadata: Readonly<Record<string, unknown>>;
}

export type AocPMFreakTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'unknown';

export interface AocPMFreakTaskReadModel {
  readonly taskId: string;
  readonly projectId: string;
  readonly milestoneId?: string;
  readonly title?: string;

  readonly status?: AocPMFreakTaskStatus;

  readonly assigneeAgentId?: string;

  readonly sourceUpdatedAt?: string;

  readonly metadata: Readonly<Record<string, unknown>>;
}

export type AocPMFreakRiskSeverity = 'low' | 'medium' | 'high' | 'critical' | 'unknown';
export type AocPMFreakRiskStatus = 'open' | 'mitigating' | 'escalated' | 'closed' | 'unknown';

export interface AocPMFreakRiskReadModel {
  readonly riskId: string;
  readonly projectId: string;
  readonly title?: string;

  readonly severity?: AocPMFreakRiskSeverity;
  readonly status?: AocPMFreakRiskStatus;

  readonly evidenceReferenceIds: readonly string[];
  readonly approvalReferenceIds: readonly string[];

  readonly sourceUpdatedAt?: string;

  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * The kind of thing an evidence reference points at. Reading a reference of
 * a given kind does not certify the underlying evidence -- see this
 * module's header and the connector README.
 */
export type AocPMFreakEvidenceKind =
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
  | 'contract_reference'
  | 'unknown';

export interface AocPMFreakEvidenceReferenceReadModel {
  readonly evidenceReferenceId: string;
  readonly projectId: string;
  readonly milestoneId?: string;
  readonly riskId?: string;
  readonly actionProposalId?: string;

  readonly evidenceKind?: AocPMFreakEvidenceKind;

  /** Whether the referenced evidence record is present in the PMFreak source -- not whether it is valid, sufficient, or certified. */
  readonly present: boolean;

  readonly sourceUpdatedAt?: string;

  readonly redacted: boolean;

  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * The kind of approval an approval reference points at. Reading a reference
 * of a given kind does not certify approval validity -- see this module's
 * header and the connector README.
 */
export type AocPMFreakApprovalKind =
  | 'pm_approval'
  | 'project_sponsor_approval'
  | 'customer_validation'
  | 'commercial_review'
  | 'contract_review'
  | 'billing_review'
  | 'legal_review'
  | 'security_review'
  | 'executive_approval'
  | 'unknown';

export interface AocPMFreakApprovalReferenceReadModel {
  readonly approvalReferenceId: string;
  readonly projectId: string;
  readonly milestoneId?: string;
  readonly riskId?: string;
  readonly actionProposalId?: string;

  readonly approvalKind?: AocPMFreakApprovalKind;

  /** Whether the referenced approval record is present in the PMFreak source -- not whether it is legally valid or sufficient. */
  readonly present: boolean;

  readonly sourceUpdatedAt?: string;

  readonly redacted: boolean;

  readonly metadata: Readonly<Record<string, unknown>>;
}

export type AocPMFreakActionProposalCategory = 'schedule' | 'risk' | 'evidence' | 'communication' | 'billing' | 'change_control' | 'unknown';

export type AocPMFreakActionProposalStatus = 'draft' | 'proposed' | 'pending_aoc_review' | 'aoc_reviewed' | 'cancelled' | 'unknown';

/**
 * A PMFreak agent's proposed action, as read from the PMFreak source.
 * Reading a proposal here does not approve, authorize, or execute the
 * action -- it is only a normalized record of what PMFreak reports an agent
 * has proposed.
 */
export interface AocPMFreakActionProposalReadModel {
  readonly actionProposalId: string;
  readonly projectId: string;
  readonly agentId: string;
  readonly passportId?: string;

  readonly proposedActionId?: string;

  readonly category?: AocPMFreakActionProposalCategory;
  readonly status?: AocPMFreakActionProposalStatus;

  readonly contextFlags: readonly string[];

  readonly evidenceReferenceIds: readonly string[];
  readonly approvalReferenceIds: readonly string[];

  readonly sourceUpdatedAt?: string;

  readonly metadata: Readonly<Record<string, unknown>>;
}
