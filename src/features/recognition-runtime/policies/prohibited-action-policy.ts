import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext, PolicyOutcome } from '../domain/policy.js';

const POLICY_ID = 'prohibited_action_denied';

export class ProhibitedActionPolicy implements Policy {
  readonly id = POLICY_ID;

  evaluate(request: ActionRequest, context: PolicyContext): PolicyOutcome {
    if (context.capabilityCheck?.prohibited) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ACTION_PROHIBITED',
        reason: `Action ${request.action} is explicitly prohibited by this capability token.`,
        decisionType: 'policy_violation',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'ACTION_NOT_PROHIBITED',
      reason: `Action ${request.action} is not on the prohibited list.`,
    };
  }
}
