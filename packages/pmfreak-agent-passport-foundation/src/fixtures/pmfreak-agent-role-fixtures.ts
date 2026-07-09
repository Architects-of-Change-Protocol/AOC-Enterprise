import type { PMFreakAgentRoleProfile } from '../domain/pmfreak-agent-role.js';

/**
 * Fresh, self-authored PMFreak agent role fixtures for this foundation
 * package. These are inspired by the domain vocabulary documented in
 * `src/features/aoc-enterprise-demo/pmfreak-agent-passport` (six roles:
 * Planning, Risk, Evidence, Client Communication, Billing Readiness, Change
 * Control) but are NOT imported from that demo pack -- a foundation-layer
 * package must not depend on a demo feature. Action/tool/data identifiers
 * below are independently authored under a `pmfreak.foundation.*` namespace
 * distinct from the demo pack's `pmfreak.action.*`/`pmfreak.capability.*`
 * identifiers.
 */
export const PMFREAK_AGENT_ROLE_PROFILES: readonly PMFreakAgentRoleProfile[] = [
  {
    role: 'planning',
    displayName: 'Planning Agent',
    description: 'Detects schedule variance and proposes replanning drafts for project schedules.',
    riskTier: 'medium',
    autonomyLevel: 'medium',
    humanOversightRequirement: 'optional',
    allowedActions: [
      'pmfreak.foundation.action.schedule.detect_variance',
      'pmfreak.foundation.action.schedule.propose_change',
      'pmfreak.foundation.action.task.draft',
    ],
    prohibitedActions: [
      'pmfreak.foundation.action.schedule.apply_change',
      'pmfreak.foundation.action.billing.mark_ready',
      'pmfreak.foundation.action.communication.send_client_update',
      'pmfreak.foundation.action.change_control.approve_request',
    ],
    humanApprovalRequiredFor: ['pmfreak.foundation.action.schedule.propose_change'],
    dataAccessScope: ['project.schedule', 'project.dependencies'],
    toolAccessScope: ['schedule_reader', 'task_drafter'],
  },
  {
    role: 'risk',
    displayName: 'Risk Agent',
    description: 'Detects project risks and drafts mitigation and evidence requests.',
    riskTier: 'high',
    autonomyLevel: 'medium',
    humanOversightRequirement: 'optional',
    allowedActions: [
      'pmfreak.foundation.action.risk.detect',
      'pmfreak.foundation.action.risk.draft_mitigation',
      'pmfreak.foundation.action.evidence.request',
    ],
    prohibitedActions: [
      'pmfreak.foundation.action.risk.close',
      'pmfreak.foundation.action.communication.send_client_update',
      'pmfreak.foundation.action.billing.mark_ready',
      'pmfreak.foundation.action.change_control.approve_request',
    ],
    humanApprovalRequiredFor: ['pmfreak.foundation.action.risk.draft_mitigation'],
    dataAccessScope: ['project.risk_register', 'project.dependencies'],
    toolAccessScope: ['risk_register_reader', 'evidence_requester'],
  },
  {
    role: 'evidence',
    displayName: 'Evidence Agent',
    description: 'Collects, classifies, and bundles project evidence for downstream review.',
    riskTier: 'medium',
    autonomyLevel: 'low',
    humanOversightRequirement: 'optional',
    allowedActions: [
      'pmfreak.foundation.action.evidence.request',
      'pmfreak.foundation.action.evidence.classify',
      'pmfreak.foundation.action.evidence.prepare_bundle',
    ],
    prohibitedActions: [
      'pmfreak.foundation.action.evidence.certify_customer_acceptance',
      'pmfreak.foundation.action.billing.mark_ready',
      'pmfreak.foundation.action.deliverable.mark_complete',
    ],
    humanApprovalRequiredFor: ['pmfreak.foundation.action.evidence.prepare_bundle'],
    dataAccessScope: ['project.evidence_store'],
    toolAccessScope: ['evidence_classifier', 'evidence_bundle_builder'],
  },
  {
    role: 'client_communication',
    displayName: 'Client Communication Agent',
    description: 'Drafts and, once approved, sends client-facing project communications.',
    riskTier: 'high',
    autonomyLevel: 'low',
    humanOversightRequirement: 'required',
    allowedActions: [
      'pmfreak.foundation.action.communication.draft_client_update',
      'pmfreak.foundation.action.communication.send_client_update',
      'pmfreak.foundation.action.communication.prepare_meeting_minutes',
    ],
    prohibitedActions: [
      'pmfreak.foundation.action.communication.make_contractual_commitment',
      'pmfreak.foundation.action.communication.admit_fault',
      'pmfreak.foundation.action.billing.claim_readiness',
    ],
    humanApprovalRequiredFor: ['pmfreak.foundation.action.communication.send_client_update'],
    dataAccessScope: ['project.communications'],
    toolAccessScope: ['communication_drafter', 'communication_sender'],
  },
  {
    role: 'billing_readiness',
    displayName: 'Billing Readiness Agent',
    description: 'Evaluates whether a project milestone appears ready for billing.',
    riskTier: 'critical',
    autonomyLevel: 'low',
    humanOversightRequirement: 'required',
    allowedActions: [
      'pmfreak.foundation.action.billing.check_readiness',
      'pmfreak.foundation.action.billing.mark_ready',
      'pmfreak.foundation.action.evidence.prepare_bundle',
    ],
    prohibitedActions: [
      'pmfreak.foundation.action.schedule.apply_change',
      'pmfreak.foundation.action.change_control.approve_request',
      'pmfreak.foundation.action.risk.close',
      'pmfreak.foundation.action.communication.send_client_update',
    ],
    humanApprovalRequiredFor: ['pmfreak.foundation.action.billing.mark_ready'],
    dataAccessScope: ['project.billing_milestones', 'project.evidence_store'],
    toolAccessScope: ['billing_readiness_checker', 'evidence_bundle_builder'],
  },
  {
    role: 'change_control',
    displayName: 'Change Control Agent',
    description: 'Detects and classifies project change requests and routes them for review.',
    riskTier: 'high',
    autonomyLevel: 'medium',
    humanOversightRequirement: 'required',
    allowedActions: [
      'pmfreak.foundation.action.change_control.classify_request',
      'pmfreak.foundation.action.communication.draft_client_update',
      'pmfreak.foundation.action.evidence.request',
    ],
    prohibitedActions: [
      'pmfreak.foundation.action.change_control.approve_request',
      'pmfreak.foundation.action.billing.mark_ready',
      'pmfreak.foundation.action.schedule.apply_change',
      'pmfreak.foundation.action.communication.send_client_update',
    ],
    humanApprovalRequiredFor: ['pmfreak.foundation.action.change_control.classify_request'],
    dataAccessScope: ['project.change_requests', 'project.scope_statements'],
    toolAccessScope: ['change_request_classifier', 'evidence_requester'],
  },
];

export function findPMFreakAgentRoleProfile(role: PMFreakAgentRoleProfile['role']): PMFreakAgentRoleProfile | undefined {
  return PMFREAK_AGENT_ROLE_PROFILES.find((profile) => profile.role === role);
}
