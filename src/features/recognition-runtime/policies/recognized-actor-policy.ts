import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext, PolicyOutcome } from '../domain/policy.js';

const POLICY_ID = 'recognized_actor_required';

export class RecognizedActorPolicy implements Policy {
  readonly id = POLICY_ID;

  evaluate(_request: ActionRequest, context: PolicyContext): PolicyOutcome {
    const { actor } = context;

    if (!actor) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ACTOR_NOT_FOUND',
        reason: 'No actor is registered for this request.',
        decisionType: 'unrecognized_actor',
      };
    }

    if (actor.status === 'revoked') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ACTOR_REVOKED',
        reason: `Actor ${actor.id} has been revoked.`,
        decisionType: 'revoked',
      };
    }

    if (actor.status === 'expired') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ACTOR_EXPIRED',
        reason: `Actor ${actor.id} recognition has expired.`,
        decisionType: 'expired',
      };
    }

    if (actor.status === 'suspended') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ACTOR_SUSPENDED',
        reason: `Actor ${actor.id} is suspended.`,
        decisionType: 'deny',
      };
    }

    if (actor.status !== 'recognized') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ACTOR_NOT_RECOGNIZED',
        reason: `Actor ${actor.id} is not recognized (status: ${actor.status}).`,
        decisionType: 'unrecognized_actor',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'ACTOR_RECOGNIZED',
      reason: `Actor ${actor.id} is recognized.`,
    };
  }
}
