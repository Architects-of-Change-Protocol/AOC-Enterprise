import type { PMFreakAgentRole, PMFreakAgentRoleProfile } from './pmfreak-agent-passport-types.js';

/**
 * PMFreak agent role catalog. Each role names the capabilities a PMFreak
 * agent of that role is allowed and explicitly restricted from, along with
 * its default evidence/approval requirements and safe-operating notes.
 * Passports (`pmfreak-agent-passport-fixtures.ts`) derive their
 * `allowedActionIds`/`restrictedActionIds` from these profiles; the
 * resolver (`resolvePMFreakAgentPassportAction`) is the sole place that
 * decision is enforced.
 */
export const PMFREAK_AGENT_ROLE_PROFILES: readonly PMFreakAgentRoleProfile[] = [
  {
    role: 'planning_agent',
    displayName: 'Planning Agent',
    description: 'Detects schedule variance, proposes replanning, and drafts schedule changes and draft project tasks.',
    allowedCapabilityIds: ['pmfreak.capability.schedule.detect_variance', 'pmfreak.capability.schedule.propose_change', 'pmfreak.capability.risk.create_draft'],
    restrictedCapabilityIds: ['pmfreak.capability.schedule.apply_change', 'pmfreak.capability.billing.mark_ready', 'pmfreak.capability.communication.send_client_update', 'pmfreak.capability.change_control.approve_request'],
    defaultApprovalRequirementIds: ['pmfreak.approval.pm_approval'],
    defaultEvidenceRequirementIds: ['pmfreak.evidence.project_status_source', 'pmfreak.evidence.schedule_baseline', 'pmfreak.evidence.dependency_record'],
    safeOperatingNotes: [
      'Cannot approve a contractual date change.',
      'Cannot notify the customer of a formal schedule change without approval.',
      'Cannot mark a project officially delayed without approval.',
      'Cannot change a billing milestone.',
      'Cannot override a customer-approved timeline.',
    ],
  },
  {
    role: 'risk_agent',
    displayName: 'Risk Agent',
    description: 'Detects risks, proposes mitigation, requests evidence, and prepares escalation drafts.',
    allowedCapabilityIds: ['pmfreak.capability.risk.create_draft', 'pmfreak.capability.evidence.request', 'pmfreak.capability.communication.draft_client_update'],
    restrictedCapabilityIds: ['pmfreak.capability.risk.close', 'pmfreak.capability.communication.send_client_update', 'pmfreak.capability.billing.mark_ready', 'pmfreak.capability.change_control.approve_request'],
    defaultApprovalRequirementIds: ['pmfreak.approval.pm_approval'],
    defaultEvidenceRequirementIds: ['pmfreak.evidence.risk_record', 'pmfreak.evidence.dependency_record'],
    safeOperatingNotes: [
      'Cannot close a risk without PM approval.',
      'Cannot assign blame to the customer.',
      'Cannot claim a contractual breach.',
      'Cannot send an escalation externally without approval.',
      'Cannot use legal-sensitive wording.',
    ],
  },
  {
    role: 'evidence_agent',
    displayName: 'Evidence Agent',
    description: 'Collects, classifies, and checks project evidence completeness.',
    allowedCapabilityIds: ['pmfreak.capability.evidence.request', 'pmfreak.capability.evidence.classify', 'pmfreak.capability.evidence.prepare_bundle'],
    restrictedCapabilityIds: ['pmfreak.capability.billing.mark_ready', 'pmfreak.capability.risk.close', 'pmfreak.capability.schedule.apply_change', 'pmfreak.capability.communication.send_client_update'],
    defaultApprovalRequirementIds: [],
    defaultEvidenceRequirementIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.meeting_minutes'],
    safeOperatingNotes: ['Cannot certify customer acceptance.', 'Cannot mark a deliverable complete without approval.', 'Cannot modify evidence.', 'Cannot delete evidence.', 'Cannot fabricate evidence.'],
  },
  {
    role: 'client_communication_agent',
    displayName: 'Client Communication Agent',
    description: 'Drafts client-facing communications, meeting minutes, and status updates.',
    allowedCapabilityIds: ['pmfreak.capability.communication.draft_client_update', 'pmfreak.capability.communication.send_client_update'],
    restrictedCapabilityIds: ['pmfreak.capability.billing.mark_ready', 'pmfreak.capability.schedule.apply_change', 'pmfreak.capability.change_control.approve_request', 'pmfreak.capability.risk.close'],
    defaultApprovalRequirementIds: ['pmfreak.approval.pm_approval'],
    defaultEvidenceRequirementIds: ['pmfreak.evidence.client_communication_draft', 'pmfreak.evidence.meeting_minutes'],
    safeOperatingNotes: [
      'Cannot send a client communication without approval.',
      'Cannot make a contractual commitment.',
      'Cannot admit fault.',
      'Cannot claim completion without evidence.',
      'Cannot claim invoice readiness.',
      'Cannot use legal-sensitive wording without review.',
    ],
  },
  {
    role: 'billing_readiness_agent',
    displayName: 'Billing Readiness Agent',
    description: 'Evaluates whether a milestone appears ready for billing based on evidence, approvals, and acceptance signals.',
    allowedCapabilityIds: ['pmfreak.capability.billing.check_readiness', 'pmfreak.capability.billing.mark_ready', 'pmfreak.capability.evidence.prepare_bundle'],
    restrictedCapabilityIds: ['pmfreak.capability.schedule.apply_change', 'pmfreak.capability.change_control.approve_request', 'pmfreak.capability.risk.close', 'pmfreak.capability.communication.send_client_update'],
    defaultApprovalRequirementIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
    defaultEvidenceRequirementIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record', 'pmfreak.evidence.billing_milestone_record'],
    safeOperatingNotes: [
      'Cannot mark invoice-ready without PM approval.',
      'Cannot override missing acceptance evidence.',
      'Cannot certify customer acceptance.',
      'Cannot create an invoice.',
      'Cannot send an invoice.',
      'Cannot release payment.',
    ],
  },
  {
    role: 'change_control_agent',
    displayName: 'Change Control Agent',
    description: 'Detects, classifies, and routes project change requests.',
    allowedCapabilityIds: ['pmfreak.capability.change_control.classify_request', 'pmfreak.capability.communication.draft_client_update', 'pmfreak.capability.evidence.request'],
    restrictedCapabilityIds: ['pmfreak.capability.change_control.approve_request', 'pmfreak.capability.billing.mark_ready', 'pmfreak.capability.schedule.apply_change', 'pmfreak.capability.communication.send_client_update'],
    defaultApprovalRequirementIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.contract_review'],
    defaultEvidenceRequirementIds: ['pmfreak.evidence.change_request_record', 'pmfreak.evidence.scope_statement'],
    safeOperatingNotes: ['Cannot approve a change request.', 'Cannot change contract terms.', 'Cannot commit a delivery date externally.', 'Cannot alter billing terms.', 'Cannot bypass customer validation.'],
  },
];

export function findPMFreakAgentRoleProfile(role: PMFreakAgentRole): PMFreakAgentRoleProfile | undefined {
  return PMFREAK_AGENT_ROLE_PROFILES.find((profile) => profile.role === role);
}
