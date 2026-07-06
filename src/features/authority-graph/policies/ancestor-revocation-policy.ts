import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext, AuthorityPolicyOutcome } from '../domain/authority-chain.js';

const POLICY_ID = 'ancestor_revocation_denied';

/**
 * If an ancestor grant or delegation in the chain has been revoked or
 * suspended, every descendant's authority is invalid -- revoking Datasys's
 * grant to Victor must invalidate Victor's delegation to PMFreak.
 */
export class AncestorRevocationPolicy implements AuthorityPolicy {
  readonly id = POLICY_ID;

  evaluate(_request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome {
    const { chain } = context;

    const revokedGrant = chain.grants.find((grant) => grant.status === 'revoked' || grant.status === 'suspended');
    if (revokedGrant) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ANCESTOR_AUTHORITY_GRANT_REVOKED',
        reason: `Authority grant ${revokedGrant.id} is ${revokedGrant.status}, invalidating everything derived from it.`,
        decisionType: 'ancestor_revoked',
      };
    }

    const revokedDelegation = chain.delegations.find(
      (delegation) => delegation.status === 'revoked' || delegation.status === 'suspended',
    );
    if (revokedDelegation) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ANCESTOR_DELEGATION_GRANT_REVOKED',
        reason: `Delegation grant ${revokedDelegation.id} is ${revokedDelegation.status}, invalidating everything derived from it.`,
        decisionType: 'ancestor_revoked',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'NO_ANCESTOR_REVOKED',
      reason: 'No revoked or suspended ancestor was found in the resolved chain.',
    };
  }
}
