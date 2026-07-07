import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';

const POLICY_ID = 'idempotency';

/** A request that already succeeded under the same idempotency key must never execute a second time. */
export class IdempotencyPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    const { adapter, request, idempotency } = context;

    if (adapter?.requiresIdempotencyKey && request.idempotencyKey === undefined) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'IDEMPOTENCY_KEY_REQUIRED',
        reason: `Adapter ${adapter.id} requires an idempotency key for this request.`,
        severity: 'error',
        decisionType: 'adapter_denied',
      };
    }

    if (idempotency?.outcome === 'duplicate_success') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'DUPLICATE_SUPPRESSED',
        reason: `Idempotency key ${idempotency.idempotencyKey ?? ''} already completed successfully; this execution is suppressed.`,
        severity: 'warning',
        decisionType: 'duplicate_suppressed',
      };
    }

    return { policyId: POLICY_ID, passed: true, reasonCode: 'IDEMPOTENCY_SATISFIED', reason: 'No duplicate execution was detected for this idempotency key.', severity: 'info' };
  }
}
