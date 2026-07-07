import type { ApprovalPolicy, ApprovalPolicyContext, ApprovalPolicyOutcome } from '../domain/approval-policy.js';

const POLICY_ID = 'quorum';

/**
 * Counts distinct approvers (prior accepted 'approved' decisions plus the
 * current attempt, if it is itself an approval) against the requirement's
 * minimumApprovals. A single approver never counts twice. This policy is
 * informational for the decision-submission gate -- ApprovalDecisionService
 * uses it to decide whether the request should transition to 'approved' and a
 * proof should be created, not to reject an otherwise-valid partial approval.
 */
export class QuorumPolicy implements ApprovalPolicy {
  readonly id = POLICY_ID;

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome {
    const { attempt, request, priorDecisions } = context;
    const minimumApprovals = request?.requirement.minimumApprovals ?? 1;

    const distinctApprovers = new Set(priorDecisions.filter((decision) => decision.type === 'approved').map((decision) => decision.approverActorId));
    if (attempt.type === 'approved') {
      distinctApprovers.add(attempt.approverActorId);
    }

    if (distinctApprovers.size < minimumApprovals) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'APPROVAL_QUORUM_NOT_MET',
        reason: `${distinctApprovers.size} of ${minimumApprovals} required distinct approvals have been recorded.`,
        severity: 'warning',
        decisionType: 'quorum_not_met',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'APPROVAL_QUORUM_MET',
      reason: `${distinctApprovers.size} of ${minimumApprovals} required distinct approvals have been recorded.`,
      severity: 'info',
    };
  }
}
