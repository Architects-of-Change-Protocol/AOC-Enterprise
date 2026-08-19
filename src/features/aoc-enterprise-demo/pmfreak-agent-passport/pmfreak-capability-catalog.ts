import type { PMFreakCapability } from './pmfreak-agent-passport-types.js';

/**
 * PMFreak capability catalog. A capability is a discrete grant of "kind of
 * work" a PMFreak agent may be issued a capability token for -- it does not
 * by itself authorize any single action, and it never auto-approves a
 * sensitive action just because a passport carries the token (see
 * `resolvePMFreakAgentPassportAction`).
 */
export const PMFREAK_CAPABILITIES: readonly PMFreakCapability[] = [
  {
    capabilityId: 'pmfreak.capability.schedule.detect_variance',
    title: 'Detect schedule variance',
    description: 'Detect deviation between a project schedule baseline and its current status.',
    category: 'planning',
    requiresEvidence: true,
    requiresApproval: false,
    defaultDecisionOnMissingEvidence: 'require_evidence',
  },
  {
    capabilityId: 'pmfreak.capability.schedule.propose_change',
    title: 'Propose schedule change',
    description: 'Draft a proposed schedule change or replanning recommendation.',
    category: 'planning',
    requiresEvidence: true,
    requiresApproval: false,
    defaultDecisionOnMissingEvidence: 'require_evidence',
  },
  {
    capabilityId: 'pmfreak.capability.schedule.apply_change',
    title: 'Apply schedule change',
    description: 'Apply a schedule change to a project, including a contractual date change.',
    category: 'planning',
    requiresEvidence: true,
    requiresApproval: true,
    defaultDecisionOnMissingEvidence: 'require_pm_approval',
  },
  {
    capabilityId: 'pmfreak.capability.risk.create_draft',
    title: 'Create risk draft',
    description: 'Create a draft project risk record and recommend mitigation.',
    category: 'risk',
    requiresEvidence: false,
    requiresApproval: false,
    defaultDecisionOnMissingEvidence: 'hold',
  },
  {
    capabilityId: 'pmfreak.capability.risk.close',
    title: 'Close risk',
    description: 'Close an open project risk record.',
    category: 'risk',
    requiresEvidence: true,
    requiresApproval: true,
    defaultDecisionOnMissingEvidence: 'require_pm_approval',
  },
  {
    capabilityId: 'pmfreak.capability.evidence.request',
    title: 'Request evidence',
    description: 'Request project evidence from a source.',
    category: 'evidence',
    requiresEvidence: false,
    requiresApproval: false,
    defaultDecisionOnMissingEvidence: 'hold',
  },
  {
    capabilityId: 'pmfreak.capability.evidence.classify',
    title: 'Classify evidence',
    description: 'Classify collected project evidence by type and completeness.',
    category: 'evidence',
    requiresEvidence: false,
    requiresApproval: false,
    defaultDecisionOnMissingEvidence: 'hold',
  },
  {
    capabilityId: 'pmfreak.capability.evidence.prepare_bundle',
    title: 'Prepare evidence bundle',
    description: 'Prepare a bundle of collected project evidence for review.',
    category: 'evidence',
    requiresEvidence: true,
    requiresApproval: false,
    defaultDecisionOnMissingEvidence: 'require_evidence',
  },
  {
    capabilityId: 'pmfreak.capability.communication.draft_client_update',
    title: 'Draft client update',
    description: 'Draft a client-facing communication, status update, or meeting minutes.',
    category: 'communication',
    requiresEvidence: false,
    requiresApproval: false,
    defaultDecisionOnMissingEvidence: 'hold',
  },
  {
    capabilityId: 'pmfreak.capability.communication.send_client_update',
    title: 'Send client update',
    description: 'Send a client-facing communication externally.',
    category: 'communication',
    requiresEvidence: false,
    requiresApproval: true,
    defaultDecisionOnMissingEvidence: 'require_pm_approval',
  },
  {
    capabilityId: 'pmfreak.capability.billing.check_readiness',
    title: 'Check billing readiness',
    description: 'Evaluate whether a milestone appears ready for billing based on evidence, approvals, and acceptance signals.',
    category: 'billing',
    requiresEvidence: true,
    requiresApproval: false,
    defaultDecisionOnMissingEvidence: 'require_evidence',
  },
  {
    capabilityId: 'pmfreak.capability.billing.mark_ready',
    title: 'Mark milestone billing-ready',
    description: 'Mark a milestone as ready for billing within Soberanía Enterprise -- this is not invoice creation, invoice sending, or payment release.',
    category: 'billing',
    requiresEvidence: true,
    requiresApproval: true,
    defaultDecisionOnMissingEvidence: 'require_evidence',
  },
  {
    capabilityId: 'pmfreak.capability.change_control.classify_request',
    title: 'Classify change request',
    description: 'Classify and route an incoming project change request.',
    category: 'change_control',
    requiresEvidence: false,
    requiresApproval: false,
    defaultDecisionOnMissingEvidence: 'hold',
  },
  {
    capabilityId: 'pmfreak.capability.change_control.approve_request',
    title: 'Approve change request',
    description: 'Approve a project change request.',
    category: 'change_control',
    requiresEvidence: true,
    requiresApproval: true,
    defaultDecisionOnMissingEvidence: 'require_pm_approval',
  },
];

export function findPMFreakCapability(capabilityId: string): PMFreakCapability | undefined {
  return PMFREAK_CAPABILITIES.find((capability) => capability.capabilityId === capabilityId);
}
