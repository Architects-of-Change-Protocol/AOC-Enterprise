import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext, AuthorityPolicyOutcome } from '../domain/authority-chain.js';

const POLICY_ID = 'cross_domain_authority_denied';

/**
 * Authority does not automatically cross trust domain boundaries. If a
 * grant or delegation in the chain belongs to a different trust domain than
 * the request, it is denied unless the target trust domain has explicitly
 * opted in to accepting cross-domain authority.
 */
export class CrossDomainAuthorityPolicy implements AuthorityPolicy {
  readonly id = POLICY_ID;

  evaluate(request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome {
    const { chain, crossDomainAccepted } = context;

    if (crossDomainAccepted) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'CROSS_DOMAIN_AUTHORITY_ACCEPTED',
        reason: `Trust domain ${request.trustDomainId} explicitly accepts cross-domain authority.`,
      };
    }

    const foreignGrant = chain.grants.find((grant) => grant.trustDomainId !== request.trustDomainId);
    const foreignDelegation = chain.delegations.find((delegation) => delegation.trustDomainId !== request.trustDomainId);
    const foreignEntity = foreignGrant ?? foreignDelegation;

    if (foreignEntity) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'AUTHORITY_CROSSES_TRUST_DOMAIN',
        reason: `${foreignEntity.id} belongs to trust domain ${foreignEntity.trustDomainId}, not ${request.trustDomainId}.`,
        decisionType: 'cross_domain_authority_denied',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'AUTHORITY_WITHIN_TRUST_DOMAIN',
      reason: 'Every grant and delegation in the chain belongs to the requested trust domain.',
    };
  }
}
