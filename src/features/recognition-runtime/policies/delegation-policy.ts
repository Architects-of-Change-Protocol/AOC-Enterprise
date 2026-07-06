import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext, PolicyOutcome } from '../domain/policy.js';

const POLICY_ID = 'delegation_limited';

export class DelegationPolicy implements Policy {
  readonly id = POLICY_ID;

  evaluate(_request: ActionRequest, context: PolicyContext): PolicyOutcome {
    const token = context.capabilityToken;
    if (!token) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'NO_DELEGATION_TO_CHECK',
        reason: 'No capability token to evaluate delegation limits for.',
      };
    }

    if (token.delegation.delegationDepth > token.delegation.maxDelegationDepth) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'DELEGATION_DEPTH_EXCEEDED',
        reason: `Capability token ${token.id} delegation depth ${token.delegation.delegationDepth} exceeds its limit of ${token.delegation.maxDelegationDepth}.`,
        decisionType: 'policy_violation',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'DELEGATION_WITHIN_LIMITS',
      reason: `Capability token ${token.id} delegation depth is within its limit.`,
    };
  }
}
