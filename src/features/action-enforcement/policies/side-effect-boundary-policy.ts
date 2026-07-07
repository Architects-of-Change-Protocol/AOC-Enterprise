import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyOutcome } from '../domain/enforcement-verification.js';
import type { SideEffectType } from '../domain/side-effect.js';

const POLICY_ID = 'side_effect_boundary';

const REQUIRES_ALLOW: ReadonlySet<SideEffectType> = new Set(['write', 'send_message', 'external_api_call', 'state_change', 'financial', 'legal', 'data_export']);
const REQUIRES_APPROVAL_PROOF: ReadonlySet<SideEffectType> = new Set(['financial', 'legal', 'data_export']);

/** A side effect's declared type bounds what an allow decision is permitted to authorize. */
export class SideEffectBoundaryPolicy implements EnforcementPolicy {
  readonly id = POLICY_ID;

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyOutcome {
    const sideEffectType = context.request.intent.sideEffectType;

    if (!REQUIRES_ALLOW.has(sideEffectType)) {
      return { policyId: POLICY_ID, passed: true, reasonCode: 'SIDE_EFFECT_LOW_RISK', reason: `Side effect type '${sideEffectType}' does not require an allow decision.`, severity: 'info' };
    }

    if (context.recognitionMappedDecisionType !== 'execute_allowed') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'SIDE_EFFECT_DENIED',
        reason: `Side effect type '${sideEffectType}' requires an allow decision, which this request does not have.`,
        severity: 'error',
        decisionType: context.recognitionMappedDecisionType ?? 'execution_blocked',
      };
    }

    if (REQUIRES_APPROVAL_PROOF.has(sideEffectType) && context.recognitionResult?.approvalProofId === undefined) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'SIDE_EFFECT_APPROVAL_PROOF_REQUIRED',
        reason: `Side effect type '${sideEffectType}' requires a confirmed approval proof.`,
        severity: 'error',
        decisionType: 'approval_required',
      };
    }

    return { policyId: POLICY_ID, passed: true, reasonCode: 'SIDE_EFFECT_PERMITTED', reason: `Side effect type '${sideEffectType}' is permitted by this decision.`, severity: 'info' };
  }
}
