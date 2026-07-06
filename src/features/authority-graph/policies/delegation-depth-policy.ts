import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext, AuthorityPolicyOutcome } from '../domain/authority-chain.js';

const POLICY_ID = 'delegation_depth_limited';

/**
 * A delegation can never exceed the maximum depth fixed by its source
 * authority, and a delegation created from a non-redelegable parent is
 * illegitimate regardless of the numeric depth it claims.
 */
export class DelegationDepthPolicy implements AuthorityPolicy {
  readonly id = POLICY_ID;

  evaluate(_request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome {
    const { chain } = context;

    for (const delegation of chain.delegations) {
      const maxDepth = delegation.maxDelegationDepth ?? 0;
      if (delegation.delegationDepth > maxDepth) {
        return {
          policyId: POLICY_ID,
          passed: false,
          reasonCode: 'DELEGATION_DEPTH_EXCEEDED',
          reason: `Delegation grant ${delegation.id} has depth ${delegation.delegationDepth}, exceeding its limit of ${maxDepth}.`,
          decisionType: 'delegation_depth_exceeded',
        };
      }
    }

    for (let i = 0; i < chain.delegations.length - 1; i += 1) {
      const parent = chain.delegations[i + 1];
      if (parent && !parent.canRedelegate) {
        return {
          policyId: POLICY_ID,
          passed: false,
          reasonCode: 'REDELEGATION_NOT_PERMITTED',
          reason: `Delegation grant ${parent.id} does not permit further redelegation.`,
          decisionType: 'delegation_not_allowed',
        };
      }
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'DELEGATION_DEPTH_WITHIN_LIMITS',
      reason: 'Every delegation in the chain is within its permitted depth.',
    };
  }
}
