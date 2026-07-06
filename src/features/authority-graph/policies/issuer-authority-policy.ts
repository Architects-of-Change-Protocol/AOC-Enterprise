import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext, AuthorityPolicyOutcome } from '../domain/authority-chain.js';

const POLICY_ID = 'issuer_authority_required';

/**
 * Every grant in the chain must have been issued by someone who actually held
 * the authority to issue it: the root grant must trace to a registered root
 * issuer for its trust domain, and every non-root grant's issuer must be the
 * subject of the grant it claims as its parent.
 */
export class IssuerAuthorityPolicy implements AuthorityPolicy {
  readonly id = POLICY_ID;

  evaluate(_request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome {
    const { chain } = context;

    if (chain.grants.length === 0) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'NO_GRANTS_TO_CHECK',
        reason: 'The chain contains no authority grants to verify issuer authority for.',
      };
    }

    for (let i = 0; i < chain.grants.length - 1; i += 1) {
      const child = chain.grants[i];
      const parent = chain.grants[i + 1];
      if (child && parent && child.issuerActorId !== parent.subjectActorId) {
        return {
          policyId: POLICY_ID,
          passed: false,
          reasonCode: 'ISSUER_DOES_NOT_HOLD_PARENT_AUTHORITY',
          reason: `Grant ${child.id} was issued by ${child.issuerActorId}, who does not hold parent grant ${parent.id}.`,
          decisionType: 'issuer_not_authorized',
        };
      }
    }

    const rootGrant = chain.grants[chain.grants.length - 1];
    if (rootGrant && rootGrant.parentGrantId === undefined && !context.rootIssuerAccepted) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ROOT_ISSUER_NOT_ACCEPTED',
        reason: `Grant ${rootGrant.id} was issued by ${rootGrant.issuerActorId}, who is not a registered root issuer for trust domain ${chain.trustDomainId}.`,
        decisionType: 'issuer_not_authorized',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'ISSUER_AUTHORIZED',
      reason: 'Every issuer in the chain held the authority it issued from.',
    };
  }
}
