import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';

const POLICY_ID = 'emergency_deny';

/** Wins over every other policy: when active, nothing executes. */
export class EmergencyDenyPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    if (context.emergencyDeny) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'EMERGENCY_DENIED',
        reason: 'Emergency deny is active; all execution is blocked.',
        severity: 'critical',
        decisionType: 'emergency_denied',
      };
    }
    return { policyId: POLICY_ID, passed: true, reasonCode: 'EMERGENCY_DENY_INACTIVE', reason: 'Emergency deny is not active.', severity: 'info' };
  }
}
