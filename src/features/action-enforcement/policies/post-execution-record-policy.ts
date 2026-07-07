import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';

const POLICY_ID = 'post_execution_record';

/**
 * Always passes during preflight -- there is nothing to record yet. The real
 * invariant ("every execution attempt produces an ExecutionResult and
 * EnforcementProof") is asserted by GuardedExecutionService immediately after
 * it runs (or declines to run) the executor; a violation there throws
 * PostExecutionRecordMissingError rather than surfacing as a normal decision.
 */
export class PostExecutionRecordPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(_context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'POST_EXECUTION_PENDING',
      reason: 'Post-execution recording is asserted after the executor runs, not during preflight.',
      severity: 'info',
    };
  }
}
