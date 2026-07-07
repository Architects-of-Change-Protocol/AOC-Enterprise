import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';

const POLICY_ID = 'allow_decision_required';

/** Only a mapped 'execute_allowed' recognition outcome may proceed; every other mapped outcome blocks with its own specific reason. */
export class AllowDecisionRequiredPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    if (context.recognitionMappedDecisionType === 'execute_allowed') {
      return { policyId: POLICY_ID, passed: true, reasonCode: 'ALLOW_DECISION_PRESENT', reason: 'Recognition Runtime returned an allow decision.', severity: 'info' };
    }

    return {
      policyId: POLICY_ID,
      passed: false,
      reasonCode: context.recognitionMappedReasonCode ?? 'ALLOW_DECISION_REQUIRED',
      reason: context.recognitionMappedReason ?? 'Recognition Runtime did not return an allow decision.',
      severity: 'error',
      decisionType: context.recognitionMappedDecisionType ?? 'execution_blocked',
    };
  }
}
