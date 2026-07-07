import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';

const POLICY_ID = 'execution_timeout';

/** Uses only the injected clock -- an expired request blocks regardless of what recognition decided. */
export class ExecutionTimeoutPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    const { request, now } = context;
    if (request.expiresAt !== undefined && Date.parse(request.expiresAt) < Date.parse(now)) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'REQUEST_EXPIRED',
        reason: `Enforcement request ${request.id} expired at ${request.expiresAt}.`,
        severity: 'error',
        decisionType: 'expired',
      };
    }
    return { policyId: POLICY_ID, passed: true, reasonCode: 'REQUEST_NOT_EXPIRED', reason: 'This enforcement request has not expired.', severity: 'info' };
  }
}
