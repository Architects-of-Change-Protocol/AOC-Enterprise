import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext, AuthorityPolicyOutcome } from '../domain/authority-chain.js';

const POLICY_ID = 'ancestor_expiration_denied';

/**
 * If an ancestor grant or delegation in the chain has expired -- by status
 * or by its expiresAt timestamp -- every descendant's authority is invalid.
 */
export class AncestorExpirationPolicy implements AuthorityPolicy {
  readonly id = POLICY_ID;

  evaluate(_request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome {
    const { chain, now } = context;

    const expiredGrant = chain.grants.find(
      (grant) => grant.status === 'expired' || (grant.expiresAt !== undefined && grant.expiresAt <= now),
    );
    if (expiredGrant) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ANCESTOR_AUTHORITY_GRANT_EXPIRED',
        reason: `Authority grant ${expiredGrant.id} has expired, invalidating everything derived from it.`,
        decisionType: 'ancestor_expired',
      };
    }

    const expiredDelegation = chain.delegations.find(
      (delegation) => delegation.status === 'expired' || (delegation.expiresAt !== undefined && delegation.expiresAt <= now),
    );
    if (expiredDelegation) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ANCESTOR_DELEGATION_GRANT_EXPIRED',
        reason: `Delegation grant ${expiredDelegation.id} has expired, invalidating everything derived from it.`,
        decisionType: 'ancestor_expired',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'NO_ANCESTOR_EXPIRED',
      reason: 'No expired ancestor was found in the resolved chain.',
    };
  }
}
