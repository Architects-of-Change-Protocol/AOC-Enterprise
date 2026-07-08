import {
  PMFREAK_DEMO_CHANGE_REQUEST_SCOPE_ADJUSTMENT_ID,
  PMFREAK_DEMO_MILESTONE_PHASE_1_DELIVERY_ID,
  PMFREAK_DEMO_RISK_UNCONFIRMED_CUSTOMER_ACCEPTANCE_ID,
  PMFREAK_PROJECT_GOVERNANCE_DEMO_PROJECT_ID,
} from './pmfreak-project-governance-scenario-constants.js';
import type { PMFreakDemoChangeRequest, PMFreakDemoMilestone, PMFreakDemoRisk } from './pmfreak-project-governance-scenario-types.js';

/**
 * Deterministic demo milestone/risk/change-request fixtures. These are
 * narrative domain records only -- they describe what a milestone, risk, or
 * change request could look like inside PMFreak, and what evidence/approval
 * signals its own workflow would track. They are never consulted by
 * `resolvePMFreakAgentPassportAction`; the scenario runner in this pack
 * gates every attempted action solely through that resolver, so these
 * fixtures never become a second, duplicate evidence/approval engine.
 */

export const demoPMFreakMilestones: readonly PMFreakDemoMilestone[] = [
  {
    milestoneId: PMFREAK_DEMO_MILESTONE_PHASE_1_DELIVERY_ID,
    projectId: PMFREAK_PROJECT_GOVERNANCE_DEMO_PROJECT_ID,
    title: 'Demo Network Refresh Phase 1 Delivery',
    status: 'pending_acceptance',
    requiredEvidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record', 'pmfreak.evidence.billing_milestone_record'],
    requiredApprovalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
    notes: ['Deterministic demo milestone fixture. Not a real Datasys/PMFreak milestone or acceptance record.'],
  },
];

export const demoPMFreakRisks: readonly PMFreakDemoRisk[] = [
  {
    riskId: PMFREAK_DEMO_RISK_UNCONFIRMED_CUSTOMER_ACCEPTANCE_ID,
    projectId: PMFREAK_PROJECT_GOVERNANCE_DEMO_PROJECT_ID,
    title: 'Unconfirmed customer acceptance for the Phase 1 deliverable',
    severity: 'medium',
    status: 'open',
    requiredEvidenceIds: ['pmfreak.evidence.risk_record', 'pmfreak.evidence.dependency_record', 'pmfreak.evidence.mitigation_record'],
    requiredApprovalIds: ['pmfreak.approval.pm_approval'],
    notes: ['Deterministic demo risk fixture. Does not assign blame or claim a contractual breach.'],
  },
];

export const demoPMFreakChangeRequests: readonly PMFreakDemoChangeRequest[] = [
  {
    changeRequestId: PMFREAK_DEMO_CHANGE_REQUEST_SCOPE_ADJUSTMENT_ID,
    projectId: PMFREAK_PROJECT_GOVERNANCE_DEMO_PROJECT_ID,
    title: 'Scope adjustment request for network hardware substitution',
    status: 'draft',
    impactAreas: ['scope', 'schedule'],
    requiredEvidenceIds: ['pmfreak.evidence.change_request_record', 'pmfreak.evidence.scope_statement'],
    requiredApprovalIds: ['pmfreak.approval.pm_approval'],
    notes: ['Deterministic demo change request fixture. Not a real contract amendment.'],
  },
];

export function findDemoPMFreakMilestone(milestoneId: string): PMFreakDemoMilestone | undefined {
  return demoPMFreakMilestones.find((milestone) => milestone.milestoneId === milestoneId);
}

export function findDemoPMFreakRisk(riskId: string): PMFreakDemoRisk | undefined {
  return demoPMFreakRisks.find((risk) => risk.riskId === riskId);
}

export function findDemoPMFreakChangeRequest(changeRequestId: string): PMFreakDemoChangeRequest | undefined {
  return demoPMFreakChangeRequests.find((changeRequest) => changeRequest.changeRequestId === changeRequestId);
}
