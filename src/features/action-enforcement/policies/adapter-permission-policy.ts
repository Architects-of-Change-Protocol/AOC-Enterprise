import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';
import { evaluateAdapterPermission } from '../services/adapter-registry.js';

const POLICY_ID = 'adapter_permission';

/** An adapter can deny actions/capabilities/scopes even when recognition allows them. Adapter deny always wins. */
export class AdapterPermissionPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    const { adapter, request } = context;
    if (!adapter) {
      return { policyId: POLICY_ID, passed: true, reasonCode: 'NO_ADAPTER_REGISTERED', reason: 'No adapter is registered for this target; nothing to check.', severity: 'info' };
    }

    const check = evaluateAdapterPermission(adapter, {
      action: request.action,
      resourceScope: request.resourceScope,
      ...(request.capability !== undefined ? { capability: request.capability } : {}),
      ...(request.idempotencyKey !== undefined ? { idempotencyKey: request.idempotencyKey } : {}),
    });

    if (check.allowed) {
      return { policyId: POLICY_ID, passed: true, reasonCode: check.reasonCode, reason: check.reason, severity: 'info' };
    }

    return { policyId: POLICY_ID, passed: false, reasonCode: check.reasonCode, reason: check.reason, severity: 'error', decisionType: 'adapter_denied' };
  }
}
