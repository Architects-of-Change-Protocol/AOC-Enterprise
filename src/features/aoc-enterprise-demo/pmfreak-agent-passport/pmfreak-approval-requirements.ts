import type { PMFreakApprovalRequirement } from './pmfreak-agent-passport-types.js';

/**
 * PMFreak approval requirement catalog. A passport granting authority for an
 * action never substitutes for these approvals -- the passport makes an
 * action *possible*; an approval still gates its *execution*. See this
 * pack's README and `resolvePMFreakAgentPassportAction`.
 */
export const PMFREAK_APPROVAL_REQUIREMENTS: readonly PMFreakApprovalRequirement[] = [
  {
    approvalRequirementId: 'pmfreak.approval.pm_approval',
    title: 'PM approval',
    description: 'Approval from the project manager responsible for the project.',
    approvalType: 'pm_approval',
    required: true,
  },
  {
    approvalRequirementId: 'pmfreak.approval.project_sponsor_approval',
    title: 'Project sponsor approval',
    description: 'Approval from the project sponsor.',
    approvalType: 'project_sponsor_approval',
    required: true,
  },
  {
    approvalRequirementId: 'pmfreak.approval.customer_validation',
    title: 'Customer validation',
    description: 'Validation or acknowledgement from the customer.',
    approvalType: 'customer_validation',
    required: true,
  },
  {
    approvalRequirementId: 'pmfreak.approval.commercial_review',
    title: 'Commercial review',
    description: 'Review by a commercial/deal-desk function.',
    approvalType: 'commercial_review',
    required: true,
  },
  {
    approvalRequirementId: 'pmfreak.approval.contract_review',
    title: 'Contract review',
    description: 'Review of the action against the governing contract -- an operational review path, not legal advice.',
    approvalType: 'contract_review',
    required: true,
  },
  {
    approvalRequirementId: 'pmfreak.approval.billing_review',
    title: 'Billing review',
    description: 'Review by the billing/finance function before a milestone may be marked billing-ready.',
    approvalType: 'billing_review',
    required: true,
  },
  {
    approvalRequirementId: 'pmfreak.approval.legal_review',
    title: 'Legal review',
    description: 'Review by legal counsel -- this pack never claims legal clearance itself; it only routes to this review path.',
    approvalType: 'legal_review',
    required: true,
  },
  {
    approvalRequirementId: 'pmfreak.approval.security_review',
    title: 'Security review',
    description: 'Review by the security function.',
    approvalType: 'security_review',
    required: true,
  },
  {
    approvalRequirementId: 'pmfreak.approval.executive_approval',
    title: 'Executive approval',
    description: 'Approval from an executive sponsor.',
    approvalType: 'executive_approval',
    required: true,
  },
];

export function findPMFreakApprovalRequirement(approvalRequirementId: string): PMFreakApprovalRequirement | undefined {
  return PMFREAK_APPROVAL_REQUIREMENTS.find((requirement) => requirement.approvalRequirementId === approvalRequirementId);
}
