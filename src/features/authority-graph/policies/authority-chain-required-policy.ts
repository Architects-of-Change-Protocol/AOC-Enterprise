import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext, AuthorityPolicyOutcome } from '../domain/authority-chain.js';

const POLICY_ID = 'authority_chain_required';

/**
 * Every action needs a resolved chain of authority: either a direct grant
 * held by the acting actor, or a delegation tracing back to one. A chain the
 * resolver could not build at all, or could only partially build, means the
 * action has no legitimate authority behind it.
 */
export class AuthorityChainRequiredPolicy implements AuthorityPolicy {
  readonly id = POLICY_ID;

  evaluate(request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome {
    const { chain } = context;

    if (chain.status === 'invalid') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'AUTHORITY_CHAIN_MISSING',
        reason: `No authority chain could be resolved for actor ${request.actorId} to perform ${request.action}.`,
        decisionType: 'authority_missing',
      };
    }

    if (chain.status === 'partial') {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'AUTHORITY_CHAIN_MISSING',
        reason: `Actor ${request.actorId} holds authority in trust domain ${request.trustDomainId}, but none of it covers ${request.action}.`,
        decisionType: 'authority_missing',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'AUTHORITY_CHAIN_RESOLVED',
      reason: `An authority chain was resolved for actor ${request.actorId}.`,
    };
  }
}
