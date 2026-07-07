import type { ApprovalPolicy, ApprovalPolicyContext, ApprovalPolicyOutcome } from '../domain/approval-policy.js';

const POLICY_ID = 'approval_scope';

/**
 * An approver can only approve within the resource scope Authority Graph
 * actually proves for them. Victor can approve project:HMP-14665 but not
 * project:GCH-15992 unless Authority Graph proves that scope too.
 */
export class ApprovalScopePolicy implements ApprovalPolicy {
  readonly id = POLICY_ID;

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome {
    const { authorityCheck, request } = context;
    if (!authorityCheck || authorityCheck.type !== 'scope_expansion_detected') {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'APPROVAL_IN_SCOPE',
        reason: 'No out-of-scope authority was detected for this approval.',
        severity: 'info',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: false,
      reasonCode: 'APPROVAL_OUT_OF_SCOPE',
      reason: `Approver does not hold authority over resource scope "${request?.resourceScope ?? 'unknown'}".`,
      severity: 'critical',
      decisionType: 'out_of_scope',
    };
  }
}
