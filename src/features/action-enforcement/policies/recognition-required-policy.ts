import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';

const POLICY_ID = 'recognition_required';

/** Enforcement requires a Recognition Runtime verification result; missing or malformed always defaults to deny. */
export class RecognitionRequiredPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    const result = context.recognitionResult;
    if (!result) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'RECOGNITION_MISSING',
        reason: 'No Recognition Runtime verification result is available for this request.',
        severity: 'critical',
        decisionType: 'execution_blocked',
      };
    }
    if (typeof result.type !== 'string' || result.type.length === 0 || typeof result.reasonCode !== 'string' || typeof result.reason !== 'string') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'RECOGNITION_INVALID',
        reason: 'Recognition Runtime returned a malformed verification result.',
        severity: 'critical',
        decisionType: 'execution_blocked',
      };
    }
    return { policyId: POLICY_ID, passed: true, reasonCode: 'RECOGNITION_PRESENT', reason: 'A Recognition Runtime verification result is present.', severity: 'info' };
  }
}
