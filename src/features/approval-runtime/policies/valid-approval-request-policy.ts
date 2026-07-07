import type { ApprovalDecisionType } from '../domain/approval-decision.js';
import type { ApprovalPolicy, ApprovalPolicyContext, ApprovalPolicyOutcome } from '../domain/approval-policy.js';
import type { ApprovalRequestStatus } from '../domain/approval-status.js';

const POLICY_ID = 'valid_approval_request';

const CLOSED_STATUS_DECISION_TYPE: Readonly<Partial<Record<ApprovalRequestStatus, ApprovalDecisionType>>> = {
  expired: 'expired',
  revoked: 'revoked',
  rejected: 'rejected',
  cancelled: 'rejected',
  superseded: 'rejected',
};

/**
 * Gate on the ApprovalRequest's own lifecycle status. A request must be
 * "pending" to receive a new decision -- cancelled, revoked, rejected,
 * expired or superseded requests cannot receive new approvals. Existence of
 * the request is checked by the caller (ApprovalDecisionService) before
 * policies run, since a missing request is a lookup failure, not a policy.
 */
export class ValidApprovalRequestPolicy implements ApprovalPolicy {
  readonly id = POLICY_ID;

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome {
    const { request } = context;
    if (!request) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'APPROVAL_REQUEST_INVALID',
        reason: 'No approval request was resolved for this decision attempt.',
        severity: 'critical',
        decisionType: 'rejected',
      };
    }

    if (request.status !== 'pending') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'APPROVAL_REQUEST_INVALID',
        reason: `Approval request ${request.id} has status "${request.status}" and cannot receive new decisions.`,
        severity: 'critical',
        decisionType: CLOSED_STATUS_DECISION_TYPE[request.status] ?? 'rejected',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'APPROVAL_REQUEST_VALID',
      reason: `Approval request ${request.id} is pending and may receive a new decision.`,
      severity: 'info',
    };
  }
}
