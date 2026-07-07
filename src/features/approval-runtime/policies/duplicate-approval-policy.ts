import type { ApprovalPolicy, ApprovalPolicyContext, ApprovalPolicyOutcome } from '../domain/approval-policy.js';

const POLICY_ID = 'duplicate_approval';

/** The same approver cannot satisfy quorum multiple times on the same request. */
export class DuplicateApprovalPolicy implements ApprovalPolicy {
  readonly id = POLICY_ID;

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome {
    const { attempt, priorDecisions } = context;
    if (attempt.type !== 'approved') {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'DUPLICATE_CHECK_NOT_APPLICABLE',
        reason: 'Duplicate-approval checks only apply to approval decisions.',
        severity: 'info',
      };
    }

    const alreadyApproved = priorDecisions.some((decision) => decision.approverActorId === attempt.approverActorId && decision.type === 'approved');
    if (alreadyApproved) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'DUPLICATE_APPROVAL',
        reason: `Approver ${attempt.approverActorId} has already approved this request; the same approver cannot satisfy quorum twice.`,
        severity: 'error',
        decisionType: 'duplicate_approval',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'NO_DUPLICATE_APPROVAL',
      reason: 'Approver has not already approved this request.',
      severity: 'info',
    };
  }
}
