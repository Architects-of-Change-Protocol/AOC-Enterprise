import type {
  AocPMFreakActionProposalReadModel,
  AocPMFreakAgentReadModel,
  AocPMFreakApprovalReferenceReadModel,
  AocPMFreakEvidenceReferenceReadModel,
  AocPMFreakMilestoneReadModel,
  AocPMFreakProjectReadModel,
  AocPMFreakRiskReadModel,
  AocPMFreakTaskReadModel,
} from './pmfreak-read-models.js';

/**
 * AOC PMFreak Read-Only Connector v1 -- deterministic demo fixture ids.
 *
 * Every id below is a deterministic, opaque demo identifier used by the
 * in-memory read-only source and this module's tests. None is a real
 * Datasys/PMFreak project code, customer name, contract number, invoice
 * number, or email address.
 */
export const AOC_PMFREAK_DEMO_WORKSPACE_ID = 'workspace.demo.pmfreak' as const;
export const AOC_PMFREAK_DEMO_TENANT_ID = 'tenant.demo.pmfreak' as const;
export const AOC_PMFREAK_DEMO_PROJECT_ID = 'project.demo.network-refresh' as const;
export const AOC_PMFREAK_DEMO_CUSTOMER_ID = 'customer.demo.acme' as const;

export const AOC_PMFREAK_DEMO_AGENT_PLANNING_ID = 'pmfreak.agent.planning' as const;
export const AOC_PMFREAK_DEMO_AGENT_RISK_ID = 'pmfreak.agent.risk' as const;
export const AOC_PMFREAK_DEMO_AGENT_EVIDENCE_ID = 'pmfreak.agent.evidence' as const;
export const AOC_PMFREAK_DEMO_AGENT_CLIENT_COMMUNICATION_ID = 'pmfreak.agent.client_communication' as const;
export const AOC_PMFREAK_DEMO_AGENT_BILLING_READINESS_ID = 'pmfreak.agent.billing_readiness' as const;
export const AOC_PMFREAK_DEMO_AGENT_CHANGE_CONTROL_ID = 'pmfreak.agent.change_control' as const;

export const AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID = 'milestone.demo.network-refresh.phase-1-delivery' as const;
export const AOC_PMFREAK_DEMO_MILESTONE_PHASE_2_ID = 'milestone.demo.network-refresh.phase-2-planning' as const;

export const AOC_PMFREAK_DEMO_TASK_COLLECT_ACCEPTANCE_ID = 'task.demo.network-refresh.collect-acceptance' as const;
export const AOC_PMFREAK_DEMO_TASK_SCHEDULE_REVIEW_ID = 'task.demo.network-refresh.schedule-review' as const;

export const AOC_PMFREAK_DEMO_RISK_UNCONFIRMED_ACCEPTANCE_ID = 'risk.demo.unconfirmed-customer-acceptance' as const;

export const AOC_PMFREAK_DEMO_EVIDENCE_CUSTOMER_ACCEPTANCE_MISSING_ID = 'evidence.demo.customer-acceptance.missing' as const;
export const AOC_PMFREAK_DEMO_EVIDENCE_DELIVERABLE_PRESENT_ID = 'evidence.demo.deliverable-evidence.present' as const;

export const AOC_PMFREAK_DEMO_APPROVAL_BILLING_REVIEW_MISSING_ID = 'approval.demo.billing-review.missing' as const;
export const AOC_PMFREAK_DEMO_APPROVAL_PM_APPROVAL_PRESENT_ID = 'approval.demo.pm-approval.present' as const;

export const AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID = 'proposal.demo.billing-readiness.mark-ready' as const;

/** Fixed, non-clock demo timestamp shared by every default fixture record. */
const AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT = '2026-01-01T00:00:00.000Z' as const;

export function buildAocPMFreakInMemoryProjectFixtures(): AocPMFreakProjectReadModel[] {
  return [
    {
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      workspaceId: AOC_PMFREAK_DEMO_WORKSPACE_ID,
      tenantId: AOC_PMFREAK_DEMO_TENANT_ID,
      customerId: AOC_PMFREAK_DEMO_CUSTOMER_ID,
      projectName: 'Network Refresh (Demo)',
      projectStatus: 'ready_for_billing_review',
      phase: 'billing',
      milestoneIds: [AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID, AOC_PMFREAK_DEMO_MILESTONE_PHASE_2_ID],
      taskIds: [AOC_PMFREAK_DEMO_TASK_COLLECT_ACCEPTANCE_ID, AOC_PMFREAK_DEMO_TASK_SCHEDULE_REVIEW_ID],
      riskIds: [AOC_PMFREAK_DEMO_RISK_UNCONFIRMED_ACCEPTANCE_ID],
      evidenceReferenceIds: [AOC_PMFREAK_DEMO_EVIDENCE_CUSTOMER_ACCEPTANCE_MISSING_ID, AOC_PMFREAK_DEMO_EVIDENCE_DELIVERABLE_PRESENT_ID],
      approvalReferenceIds: [AOC_PMFREAK_DEMO_APPROVAL_BILLING_REVIEW_MISSING_ID, AOC_PMFREAK_DEMO_APPROVAL_PM_APPROVAL_PRESENT_ID],
      actionProposalIds: [AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID],
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      metadata: {},
    },
  ];
}

export function buildAocPMFreakInMemoryAgentFixtures(): AocPMFreakAgentReadModel[] {
  const workspaceIds = [AOC_PMFREAK_DEMO_WORKSPACE_ID];
  const projectIds = [AOC_PMFREAK_DEMO_PROJECT_ID];

  return [
    { agentId: AOC_PMFREAK_DEMO_AGENT_PLANNING_ID, agentDisplayName: 'Planning Agent (Demo)', role: 'planning_agent', status: 'active', workspaceIds, projectIds, sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT, metadata: {} },
    { agentId: AOC_PMFREAK_DEMO_AGENT_RISK_ID, agentDisplayName: 'Risk Agent (Demo)', role: 'risk_agent', status: 'active', workspaceIds, projectIds, sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT, metadata: {} },
    { agentId: AOC_PMFREAK_DEMO_AGENT_EVIDENCE_ID, agentDisplayName: 'Evidence Agent (Demo)', role: 'evidence_agent', status: 'active', workspaceIds, projectIds, sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT, metadata: {} },
    {
      agentId: AOC_PMFREAK_DEMO_AGENT_CLIENT_COMMUNICATION_ID,
      agentDisplayName: 'Client Communication Agent (Demo)',
      role: 'client_communication_agent',
      status: 'active',
      workspaceIds,
      projectIds,
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      metadata: {},
    },
    {
      agentId: AOC_PMFREAK_DEMO_AGENT_BILLING_READINESS_ID,
      agentDisplayName: 'Billing Readiness Agent (Demo)',
      role: 'billing_readiness_agent',
      status: 'active',
      workspaceIds,
      projectIds,
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      metadata: {},
    },
    {
      agentId: AOC_PMFREAK_DEMO_AGENT_CHANGE_CONTROL_ID,
      agentDisplayName: 'Change Control Agent (Demo)',
      role: 'change_control_agent',
      status: 'active',
      workspaceIds,
      projectIds,
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      metadata: {},
    },
  ];
}

export function buildAocPMFreakInMemoryMilestoneFixtures(): AocPMFreakMilestoneReadModel[] {
  return [
    {
      milestoneId: AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID,
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      title: 'Phase 1 Delivery (Demo)',
      status: 'billing_review',
      evidenceReferenceIds: [AOC_PMFREAK_DEMO_EVIDENCE_CUSTOMER_ACCEPTANCE_MISSING_ID, AOC_PMFREAK_DEMO_EVIDENCE_DELIVERABLE_PRESENT_ID],
      approvalReferenceIds: [AOC_PMFREAK_DEMO_APPROVAL_BILLING_REVIEW_MISSING_ID, AOC_PMFREAK_DEMO_APPROVAL_PM_APPROVAL_PRESENT_ID],
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      metadata: {},
    },
    {
      milestoneId: AOC_PMFREAK_DEMO_MILESTONE_PHASE_2_ID,
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      title: 'Phase 2 Planning (Demo)',
      status: 'not_started',
      evidenceReferenceIds: [],
      approvalReferenceIds: [],
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      metadata: {},
    },
  ];
}

export function buildAocPMFreakInMemoryTaskFixtures(): AocPMFreakTaskReadModel[] {
  return [
    {
      taskId: AOC_PMFREAK_DEMO_TASK_COLLECT_ACCEPTANCE_ID,
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      milestoneId: AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID,
      title: 'Collect customer acceptance record (Demo)',
      status: 'in_progress',
      assigneeAgentId: AOC_PMFREAK_DEMO_AGENT_EVIDENCE_ID,
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      metadata: {},
    },
    {
      taskId: AOC_PMFREAK_DEMO_TASK_SCHEDULE_REVIEW_ID,
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      milestoneId: AOC_PMFREAK_DEMO_MILESTONE_PHASE_2_ID,
      title: 'Review Phase 2 schedule (Demo)',
      status: 'todo',
      assigneeAgentId: AOC_PMFREAK_DEMO_AGENT_PLANNING_ID,
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      metadata: {},
    },
  ];
}

export function buildAocPMFreakInMemoryRiskFixtures(): AocPMFreakRiskReadModel[] {
  return [
    {
      riskId: AOC_PMFREAK_DEMO_RISK_UNCONFIRMED_ACCEPTANCE_ID,
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      title: 'Customer acceptance not yet confirmed (Demo)',
      severity: 'high',
      status: 'open',
      evidenceReferenceIds: [AOC_PMFREAK_DEMO_EVIDENCE_CUSTOMER_ACCEPTANCE_MISSING_ID],
      approvalReferenceIds: [],
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      metadata: {},
    },
  ];
}

export function buildAocPMFreakInMemoryEvidenceReferenceFixtures(): AocPMFreakEvidenceReferenceReadModel[] {
  return [
    {
      evidenceReferenceId: AOC_PMFREAK_DEMO_EVIDENCE_CUSTOMER_ACCEPTANCE_MISSING_ID,
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      milestoneId: AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID,
      riskId: AOC_PMFREAK_DEMO_RISK_UNCONFIRMED_ACCEPTANCE_ID,
      actionProposalId: AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID,
      evidenceKind: 'customer_acceptance_record',
      present: false,
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      redacted: false,
      metadata: {},
    },
    {
      evidenceReferenceId: AOC_PMFREAK_DEMO_EVIDENCE_DELIVERABLE_PRESENT_ID,
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      milestoneId: AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID,
      actionProposalId: AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID,
      evidenceKind: 'deliverable_evidence',
      present: true,
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      redacted: false,
      metadata: {},
    },
  ];
}

export function buildAocPMFreakInMemoryApprovalReferenceFixtures(): AocPMFreakApprovalReferenceReadModel[] {
  return [
    {
      approvalReferenceId: AOC_PMFREAK_DEMO_APPROVAL_BILLING_REVIEW_MISSING_ID,
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      milestoneId: AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID,
      actionProposalId: AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID,
      approvalKind: 'billing_review',
      present: false,
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      redacted: false,
      metadata: {},
    },
    {
      approvalReferenceId: AOC_PMFREAK_DEMO_APPROVAL_PM_APPROVAL_PRESENT_ID,
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      milestoneId: AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID,
      actionProposalId: AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID,
      approvalKind: 'pm_approval',
      present: true,
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      redacted: false,
      metadata: {},
    },
  ];
}

export function buildAocPMFreakInMemoryActionProposalFixtures(): AocPMFreakActionProposalReadModel[] {
  return [
    {
      actionProposalId: AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID,
      projectId: AOC_PMFREAK_DEMO_PROJECT_ID,
      agentId: AOC_PMFREAK_DEMO_AGENT_BILLING_READINESS_ID,
      proposedActionId: 'pmfreak.action.billing.mark_ready',
      category: 'billing',
      status: 'pending_aoc_review',
      contextFlags: ['billing_sensitive', 'project_closure_sensitive'],
      evidenceReferenceIds: [AOC_PMFREAK_DEMO_EVIDENCE_CUSTOMER_ACCEPTANCE_MISSING_ID, AOC_PMFREAK_DEMO_EVIDENCE_DELIVERABLE_PRESENT_ID],
      approvalReferenceIds: [AOC_PMFREAK_DEMO_APPROVAL_BILLING_REVIEW_MISSING_ID, AOC_PMFREAK_DEMO_APPROVAL_PM_APPROVAL_PRESENT_ID],
      sourceUpdatedAt: AOC_PMFREAK_DEMO_SOURCE_UPDATED_AT,
      metadata: {},
    },
  ];
}
