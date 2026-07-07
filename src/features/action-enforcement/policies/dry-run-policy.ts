import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';

const POLICY_ID = 'dry_run';

/**
 * Only reached once every other policy already passed (i.e. recognition
 * would allow this action). In dry-run mode this still "passes" -- the
 * request is not denied -- but overrides the final decision type so
 * GuardedExecutionService never invokes the real executor.
 */
export class DryRunPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    if (context.request.mode !== 'dry_run') {
      return { policyId: POLICY_ID, passed: true, reasonCode: 'NOT_DRY_RUN', reason: 'This request is not a dry run.', severity: 'info' };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'DRY_RUN_NO_EXECUTION',
      reason: 'Dry run mode: recognition would allow this action, but the executor will not be invoked.',
      severity: 'info',
      decisionType: 'dry_run_allowed',
    };
  }
}
