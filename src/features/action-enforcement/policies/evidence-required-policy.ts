import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';

const POLICY_ID = 'evidence_required';

/** Never executes while Recognition Runtime is still waiting on required evidence. */
export class EvidenceRequiredPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    if (context.recognitionMappedDecisionType !== 'evidence_required') {
      return { policyId: POLICY_ID, passed: true, reasonCode: 'NO_EVIDENCE_PENDING', reason: 'No additional evidence is required for this action.', severity: 'info' };
    }

    return {
      policyId: POLICY_ID,
      passed: false,
      reasonCode: 'EVIDENCE_REQUIRED',
      reason: context.recognitionResult?.reason ?? 'This action requires additional evidence before it can execute.',
      severity: 'warning',
      decisionType: 'evidence_required',
    };
  }
}
