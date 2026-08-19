import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';
import { mapPolicyResultToEnforcementDecisionType, severityForPolicyPackResult } from '../services/policy-pack-enforcement-service.js';

const POLICY_ID = 'domain_policy_pack';

/**
 * Consults the (optional) Domain Policy Pack Runtime evaluation already
 * computed once in `EnforcementPreflightService` and attached to the
 * context as `policyPackResult` -- this policy never calls the integration
 * itself. A policy pack `allow`/`warning`/`not_applicable` never overrides
 * anything upstream: it can only ever *pass*, at which point every earlier
 * policy in the chain (recognition, approval, evidence, external standing,
 * adapter) has already had to pass for this policy to even run. A policy
 * pack `deny`/`requires_evidence`/`requires_approval`/`requires_authority`/
 * `requires_external_standing` blocks even though every core Soberanía layer
 * allowed it -- that is the entire point of this integration.
 */
export class DomainPolicyPackPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    const result = context.policyPackResult;

    if (!result || result.type === 'policy_not_applicable') {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: result?.reasonCode ?? 'POLICY_PACK_NOT_CONFIGURED',
        reason: result?.reason ?? 'No policy pack integration is configured for this enforcement runtime.',
        severity: 'info',
      };
    }

    if (result.allowed) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: result.reasonCode,
        reason: result.reason,
        severity: result.type === 'policy_warning' ? 'warning' : 'info',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: false,
      reasonCode: result.reasonCode,
      reason: result.reason,
      severity: severityForPolicyPackResult(result),
      decisionType: mapPolicyResultToEnforcementDecisionType(result) ?? 'execution_blocked',
    };
  }
}
