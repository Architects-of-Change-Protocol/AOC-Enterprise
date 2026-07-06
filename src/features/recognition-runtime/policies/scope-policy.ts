import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext, PolicyOutcome } from '../domain/policy.js';

const POLICY_ID = 'scope_required';

export class ScopePolicy implements Policy {
  readonly id = POLICY_ID;

  evaluate(request: ActionRequest, context: PolicyContext): PolicyOutcome {
    const check = context.capabilityCheck;

    if (!check?.actionGranted) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ACTION_NOT_GRANTED',
        reason: `Action ${request.action} is not granted by this capability token.`,
        decisionType: 'out_of_scope',
      };
    }

    if (!check.inResourceScope) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'RESOURCE_OUT_OF_SCOPE',
        reason: `Resource ${request.resource} is outside the capability token's resource scopes.`,
        decisionType: 'out_of_scope',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'IN_SCOPE',
      reason: `Action ${request.action} on ${request.resource} is within scope.`,
    };
  }
}
