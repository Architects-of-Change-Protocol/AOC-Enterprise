import type { ApprovalPolicy, ApprovalPolicyContext, ApprovalPolicyOutcome } from '../domain/approval-policy.js';

const POLICY_ID = 'expiration';

/** An expired ApprovalRequest cannot be approved. Evaluated strictly through the injected clock. */
export class ExpirationPolicy implements ApprovalPolicy {
  readonly id = POLICY_ID;

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome {
    const { request, now } = context;
    if (!request?.expiresAt || Date.parse(now) < Date.parse(request.expiresAt)) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'APPROVAL_NOT_EXPIRED',
        reason: 'Approval request has not expired.',
        severity: 'info',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: false,
      reasonCode: 'APPROVAL_EXPIRED',
      reason: `Approval request ${request.id} expired at ${request.expiresAt}.`,
      severity: 'error',
      decisionType: 'expired',
    };
  }
}
