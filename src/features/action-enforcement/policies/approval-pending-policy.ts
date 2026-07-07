import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';

const POLICY_ID = 'approval_pending';

/**
 * Never executes while human approval is pending -- either because
 * Recognition Runtime mapped straight to 'approval_required', or because
 * (defense in depth) it referenced an ApprovalRequest without ever
 * confirming its ApprovalProof.
 */
export class ApprovalPendingPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    const result = context.recognitionResult;
    const pendingByMapping = context.recognitionMappedDecisionType === 'approval_required';
    const pendingByProofGap =
      context.recognitionMappedDecisionType === 'execute_allowed' && result?.approvalRequestId !== undefined && result?.approvalProofId === undefined;

    if (!pendingByMapping && !pendingByProofGap) {
      return { policyId: POLICY_ID, passed: true, reasonCode: 'NO_APPROVAL_PENDING', reason: 'No human approval is pending for this action.', severity: 'info' };
    }

    return {
      policyId: POLICY_ID,
      passed: false,
      reasonCode: 'APPROVAL_PENDING',
      reason: result?.reason ?? 'This action requires human approval before it can execute.',
      severity: 'warning',
      decisionType: 'approval_required',
    };
  }
}
