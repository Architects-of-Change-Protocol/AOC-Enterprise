import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext, PolicyOutcome } from '../domain/policy.js';

const POLICY_ID = 'rogue_actor_denied';

export class RogueActorPolicy implements Policy {
  readonly id = POLICY_ID;

  evaluate(_request: ActionRequest, context: PolicyContext): PolicyOutcome {
    const { actor, trustDomain, issuerAccepted } = context;

    if (!actor) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ROGUE_ACTOR_UNKNOWN',
        reason: 'Actor could not be classified against a trust domain.',
        decisionType: 'unrecognized_actor',
      };
    }

    if (actor.type === 'unknown' || actor.type === 'external') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ROGUE_ACTOR_TYPE',
        reason: `Actor ${actor.id} is of an untrusted type (${actor.type}).`,
        decisionType: 'unrecognized_actor',
      };
    }

    if (!trustDomain) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ROGUE_ACTOR_NO_TRUST_DOMAIN',
        reason: 'Requested trust domain does not exist.',
        decisionType: 'unrecognized_actor',
      };
    }

    if (!trustDomain.acceptedActorTypes.includes(actor.type)) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ROGUE_ACTOR_TYPE_NOT_ACCEPTED',
        reason: `Trust domain ${trustDomain.id} does not accept actor type ${actor.type}.`,
        decisionType: 'unrecognized_actor',
      };
    }

    if (actor.issuerId !== undefined && !issuerAccepted) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ROGUE_ACTOR_ISSUER_NOT_ACCEPTED',
        reason: `Trust domain ${trustDomain.id} does not accept issuer ${actor.issuerId}.`,
        decisionType: 'unrecognized_actor',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'ACTOR_NOT_ROGUE',
      reason: `Actor ${actor.id} is accepted by trust domain ${trustDomain.id}.`,
    };
  }
}
