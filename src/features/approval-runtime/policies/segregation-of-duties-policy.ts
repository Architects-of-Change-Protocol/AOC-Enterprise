import type { ApprovalPolicy, ApprovalPolicyContext, ApprovalPolicyOutcome } from '../domain/approval-policy.js';

const POLICY_ID = 'segregation_of_duties';

/**
 * When the approval requirement demands segregation of duties, the requester
 * and the target of the action cannot approve their own request. PMFreak
 * Closure Agent cannot approve its own requested action. This deliberately
 * does NOT bar request.principalActorId -- that field names who the agent's
 * authority chain traces back to (the human on whose behalf an agent acts),
 * not a beneficiary of THIS approval; barring the principal would block the
 * exact human-in-the-loop review (e.g. Victor approving PMFreak's drafted
 * email) segregation of duties exists to enable. Only applies to 'approved'
 * attempts -- rejecting your own request poses no risk.
 */
export class SegregationOfDutiesPolicy implements ApprovalPolicy {
  readonly id = POLICY_ID;

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome {
    const { attempt, request } = context;
    if (attempt.type !== 'approved' || !request || !request.requirement.requiresSegregationOfDuties) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'SEGREGATION_NOT_REQUIRED',
        reason: 'Segregation of duties is not required for this approval.',
        severity: 'info',
      };
    }

    if (attempt.approverActorId === request.requestedByActorId) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'SEGREGATION_OF_DUTIES_VIOLATION',
        reason: `Approver ${attempt.approverActorId} requested this action and cannot approve it under segregation of duties.`,
        severity: 'critical',
        decisionType: 'conflict_of_interest',
      };
    }

    if (attempt.approverActorId === request.targetActorId) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'SEGREGATION_OF_DUTIES_VIOLATION',
        reason: `Approver ${attempt.approverActorId} is the target of this action and cannot approve it under segregation of duties.`,
        severity: 'critical',
        decisionType: 'conflict_of_interest',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'SEGREGATION_SATISFIED',
      reason: 'Approver is independent of the requester and beneficiary.',
      severity: 'info',
    };
  }
}
