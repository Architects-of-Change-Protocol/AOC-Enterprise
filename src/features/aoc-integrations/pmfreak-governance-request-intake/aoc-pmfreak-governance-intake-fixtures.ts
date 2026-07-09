import { evaluateAocPMFreakGovernanceRequest } from './aoc-pmfreak-governance-evaluator.js';
import type { AocPMFreakGovernanceRequest, AocPMFreakGovernanceResponse } from './aoc-pmfreak-governance-intake-types.js';

/**
 * Deterministic demo identifiers. Every id below is a fake, opaque literal
 * -- never a real customer name, Datasys project id, email, contract
 * number, or invoice number.
 */
const DEMO_CLIENT_ID = 'pmfreak.client.governance_demo.v1';
const DEMO_WORKSPACE_ID = 'workspace.governance_demo.pmfreak';
const DEMO_PROJECT_ID = 'project.governance_demo.network-refresh';
const DEMO_CUSTOMER_ID = 'customer.governance_demo.fake-co';

interface DemoRequestOverrides {
  readonly requestId: string;
  readonly agentId: string;
  readonly agentRole: string;
  readonly actionAttemptId: string;
  readonly actionId: string;
  readonly actionCategory: string;
  readonly actionTitle: string;
  readonly status?: string;
  readonly evidenceReferenceIds?: readonly string[];
  readonly providedEvidenceIds?: readonly string[];
  readonly missingEvidenceIds?: readonly string[];
  readonly approvalReferenceIds?: readonly string[];
  readonly providedApprovalIds?: readonly string[];
  readonly missingApprovalIds?: readonly string[];
  readonly billingSensitive?: boolean;
}

function buildDemoAocPMFreakGovernanceRequest(overrides: DemoRequestOverrides): AocPMFreakGovernanceRequest {
  const evidenceReferenceIds = overrides.evidenceReferenceIds ?? [];
  const providedEvidenceIds = overrides.providedEvidenceIds ?? [];
  const missingEvidenceIds = overrides.missingEvidenceIds ?? [];
  const approvalReferenceIds = overrides.approvalReferenceIds ?? [];
  const providedApprovalIds = overrides.providedApprovalIds ?? [];
  const missingApprovalIds = overrides.missingApprovalIds ?? [];

  return {
    requestId: overrides.requestId,
    clientId: DEMO_CLIENT_ID,
    providerId: 'pmfreak',
    consumerOf: 'aoc',
    requestMode: 'evaluate_only',
    actionAttempt: {
      actionAttemptId: overrides.actionAttemptId,
      agentId: overrides.agentId,
      agentRole: overrides.agentRole,
      projectId: DEMO_PROJECT_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      customerId: DEMO_CUSTOMER_ID,
      actionId: overrides.actionId,
      actionCategory: overrides.actionCategory,
      actionTitle: overrides.actionTitle,
      status: overrides.status ?? 'pending',
      contextFlags: [],
      evidenceReferenceIds: [...evidenceReferenceIds],
      approvalReferenceIds: [...approvalReferenceIds],
      metadata: {},
    },
    projectContext: {
      projectId: DEMO_PROJECT_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      customerId: DEMO_CUSTOMER_ID,
      phase: 'execution',
      status: 'active',
    },
    agentContext: {
      agentId: overrides.agentId,
      agentRole: overrides.agentRole,
    },
    actionContext: {
      actionId: overrides.actionId,
      actionCategory: overrides.actionCategory,
      actionTitle: overrides.actionTitle,
      contextFlags: [],
    },
    evidenceContext: {
      evidenceReferenceIds: [...evidenceReferenceIds],
      providedEvidenceIds: [...providedEvidenceIds],
      missingEvidenceIds: [...missingEvidenceIds],
    },
    approvalContext: {
      approvalReferenceIds: [...approvalReferenceIds],
      providedApprovalIds: [...providedApprovalIds],
      missingApprovalIds: [...missingApprovalIds],
    },
    ...(overrides.billingSensitive !== undefined ? { billingContext: { billingSensitive: overrides.billingSensitive, billingReviewReferenceIds: [] } } : {}),
    safeLabels: [],
    warnings: [],
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// Request fixtures
// ---------------------------------------------------------------------------

export const demoAocPMFreakBillingMissingEvidenceRequest: AocPMFreakGovernanceRequest = buildDemoAocPMFreakGovernanceRequest({
  requestId: 'aoc.pmfreak.demo.request.billing-missing-evidence.v1',
  agentId: 'pmfreak.agent.billing_readiness.demo',
  agentRole: 'billing_readiness_agent',
  actionAttemptId: 'attempt.billing-missing-evidence.v1',
  actionId: 'pmfreak.action.billing.mark_ready',
  actionCategory: 'billing',
  actionTitle: 'Mark milestone billing-ready',
  evidenceReferenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
  providedEvidenceIds: [],
  missingEvidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
  approvalReferenceIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
  providedApprovalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
  missingApprovalIds: [],
  billingSensitive: true,
});

export const demoAocPMFreakBillingMissingApprovalRequest: AocPMFreakGovernanceRequest = buildDemoAocPMFreakGovernanceRequest({
  requestId: 'aoc.pmfreak.demo.request.billing-missing-approval.v1',
  agentId: 'pmfreak.agent.billing_readiness.demo',
  agentRole: 'billing_readiness_agent',
  actionAttemptId: 'attempt.billing-missing-approval.v1',
  actionId: 'pmfreak.action.billing.mark_ready',
  actionCategory: 'billing',
  actionTitle: 'Mark milestone billing-ready',
  evidenceReferenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
  providedEvidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
  missingEvidenceIds: [],
  approvalReferenceIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
  providedApprovalIds: ['pmfreak.approval.pm_approval'],
  missingApprovalIds: ['pmfreak.approval.billing_review'],
  billingSensitive: true,
});

export const demoAocPMFreakBillingAllowedRequest: AocPMFreakGovernanceRequest = buildDemoAocPMFreakGovernanceRequest({
  requestId: 'aoc.pmfreak.demo.request.billing-allowed.v1',
  agentId: 'pmfreak.agent.billing_readiness.demo',
  agentRole: 'billing_readiness_agent',
  actionAttemptId: 'attempt.billing-allowed.v1',
  actionId: 'pmfreak.action.billing.mark_ready',
  actionCategory: 'billing',
  actionTitle: 'Mark milestone billing-ready',
  evidenceReferenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
  providedEvidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
  missingEvidenceIds: [],
  approvalReferenceIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
  providedApprovalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
  missingApprovalIds: [],
  billingSensitive: true,
});

export const demoAocPMFreakScheduleRequiresPmApprovalRequest: AocPMFreakGovernanceRequest = buildDemoAocPMFreakGovernanceRequest({
  requestId: 'aoc.pmfreak.demo.request.schedule-requires-pm-approval.v1',
  agentId: 'pmfreak.agent.planning.demo',
  agentRole: 'planning_agent',
  actionAttemptId: 'attempt.schedule-requires-pm-approval.v1',
  actionId: 'pmfreak.action.schedule.apply_change',
  actionCategory: 'schedule',
  actionTitle: 'Apply schedule change',
  evidenceReferenceIds: ['pmfreak.evidence.schedule_baseline'],
  providedEvidenceIds: ['pmfreak.evidence.schedule_baseline'],
  missingEvidenceIds: [],
  approvalReferenceIds: ['pmfreak.approval.pm_approval'],
  providedApprovalIds: [],
  missingApprovalIds: ['pmfreak.approval.pm_approval'],
});

export const demoAocPMFreakRiskEscalationAllowedRequest: AocPMFreakGovernanceRequest = buildDemoAocPMFreakGovernanceRequest({
  requestId: 'aoc.pmfreak.demo.request.risk-escalation-allowed.v1',
  agentId: 'pmfreak.agent.risk.demo',
  agentRole: 'risk_agent',
  actionAttemptId: 'attempt.risk-escalation-allowed.v1',
  actionId: 'pmfreak.action.risk.create_draft',
  actionCategory: 'risk',
  actionTitle: 'Create risk draft',
});

export const demoAocPMFreakClientCommunicationRequiresApprovalRequest: AocPMFreakGovernanceRequest = buildDemoAocPMFreakGovernanceRequest({
  requestId: 'aoc.pmfreak.demo.request.client-communication-requires-approval.v1',
  agentId: 'pmfreak.agent.client_communication.demo',
  agentRole: 'client_communication_agent',
  actionAttemptId: 'attempt.client-communication-requires-approval.v1',
  actionId: 'pmfreak.action.communication.send_client_update',
  actionCategory: 'communication',
  actionTitle: 'Send client update',
  evidenceReferenceIds: ['pmfreak.evidence.client_communication_draft'],
  providedEvidenceIds: ['pmfreak.evidence.client_communication_draft'],
  missingEvidenceIds: [],
  approvalReferenceIds: ['pmfreak.approval.customer_validation'],
  providedApprovalIds: [],
  missingApprovalIds: ['pmfreak.approval.customer_validation'],
});

export const demoAocPMFreakCancelledActionRequest: AocPMFreakGovernanceRequest = buildDemoAocPMFreakGovernanceRequest({
  requestId: 'aoc.pmfreak.demo.request.cancelled-action.v1',
  agentId: 'pmfreak.agent.planning.demo',
  agentRole: 'planning_agent',
  actionAttemptId: 'attempt.cancelled-action.v1',
  actionId: 'pmfreak.action.schedule.detect_variance',
  actionCategory: 'schedule',
  actionTitle: 'Detect schedule variance',
  status: 'cancelled',
});

// ---------------------------------------------------------------------------
// Response fixtures -- derived from the request fixtures above via the
// deterministic local evaluator, so request and response fixtures can never
// drift out of sync with each other.
// ---------------------------------------------------------------------------

export const demoAocPMFreakBillingMissingEvidenceResponse: AocPMFreakGovernanceResponse = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingMissingEvidenceRequest });

export const demoAocPMFreakBillingMissingApprovalResponse: AocPMFreakGovernanceResponse = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingMissingApprovalRequest });

export const demoAocPMFreakBillingAllowedResponse: AocPMFreakGovernanceResponse = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingAllowedRequest });

export const demoAocPMFreakScheduleRequiresPmApprovalResponse: AocPMFreakGovernanceResponse = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakScheduleRequiresPmApprovalRequest });

export const demoAocPMFreakRiskEscalationAllowedResponse: AocPMFreakGovernanceResponse = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakRiskEscalationAllowedRequest });

export const demoAocPMFreakClientCommunicationRequiresApprovalResponse: AocPMFreakGovernanceResponse = evaluateAocPMFreakGovernanceRequest({
  request: demoAocPMFreakClientCommunicationRequiresApprovalRequest,
});

export const demoAocPMFreakCancelledActionResponse: AocPMFreakGovernanceResponse = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakCancelledActionRequest });
