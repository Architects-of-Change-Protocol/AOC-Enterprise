import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext, AuthorityPolicyOutcome } from '../domain/authority-chain.js';

const POLICY_ID = 'self_issuance_denied';

/**
 * No actor -- least of all an agent -- can be the source of its own
 * authority. This is a structural, non-negotiable rule: an actor cannot
 * issue a grant to itself, and cannot delegate to itself.
 */
export class SelfIssuancePolicy implements AuthorityPolicy {
  readonly id = POLICY_ID;

  evaluate(_request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome {
    const { chain } = context;

    const selfIssuedGrant = chain.grants.find((grant) => grant.issuerActorId === grant.subjectActorId);
    if (selfIssuedGrant) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'SELF_ISSUED_AUTHORITY_GRANT',
        reason: `Authority grant ${selfIssuedGrant.id} was issued by actor ${selfIssuedGrant.issuerActorId} to itself.`,
        decisionType: 'self_issuance_detected',
      };
    }

    const selfIssuedDelegation = chain.delegations.find(
      (delegation) => delegation.delegatorActorId === delegation.delegateActorId,
    );
    if (selfIssuedDelegation) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'SELF_ISSUED_DELEGATION_GRANT',
        reason: `Delegation grant ${selfIssuedDelegation.id} was delegated by actor ${selfIssuedDelegation.delegatorActorId} to itself.`,
        decisionType: 'self_issuance_detected',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'NOT_SELF_ISSUED',
      reason: 'No self-issued authority was found in the resolved chain.',
    };
  }
}
