import type { ApprovalPolicy, ApprovalPolicyContext, ApprovalPolicyOutcome } from '../domain/approval-policy.js';

const POLICY_ID = 'revocation';

/**
 * Revoked ApprovalRequests cannot be approved, and an approver whose
 * authority was revoked before decision time cannot approve either.
 */
export class RevocationPolicy implements ApprovalPolicy {
  readonly id = POLICY_ID;

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome {
    const { request, authorityCheck } = context;

    if (request?.status === 'revoked') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'APPROVAL_REVOKED',
        reason: `Approval request ${request.id} was revoked.`,
        severity: 'critical',
        decisionType: 'revoked',
      };
    }

    if (authorityCheck?.type === 'ancestor_revoked') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'APPROVAL_REVOKED',
        reason: authorityCheck.reason,
        severity: 'critical',
        decisionType: 'revoked',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'APPROVAL_NOT_REVOKED',
      reason: 'Neither the approval request nor the approver authority behind it has been revoked.',
      severity: 'info',
    };
  }
}
