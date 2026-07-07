import type { ApprovalPolicy, ApprovalPolicyContext, ApprovalPolicyOutcome } from '../domain/approval-policy.js';

const POLICY_ID = 'recognized_approver';

/** An approver must be recognized: known, not rogue, not suspended, not revoked. */
export class RecognizedApproverPolicy implements ApprovalPolicy {
  readonly id = POLICY_ID;

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome {
    const { approverRecognition, attempt } = context;
    if (!approverRecognition.recognized) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'INVALID_APPROVER',
        reason: approverRecognition.reason,
        severity: 'critical',
        decisionType: 'invalid_approver',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'APPROVER_RECOGNIZED',
      reason: `Approver ${attempt.approverActorId} is recognized.`,
      severity: 'info',
    };
  }
}
