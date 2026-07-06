import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext, AuthorityPolicyOutcome } from '../domain/authority-chain.js';

const POLICY_ID = 'delegation_scope_contained';

function isInScope(requested: string, granted: readonly string[]): boolean {
  return granted.some((scope) => requested === scope || requested.startsWith(`${scope}:`));
}

/**
 * Delegated authority can never expand beyond the scope it was derived from.
 * Every resourceScope granted to a delegate must be contained in its source
 * authority's resourceScopes, all the way up the chain, and the requested
 * resource must itself be covered by the terminal authority.
 */
export class DelegationScopePolicy implements AuthorityPolicy {
  readonly id = POLICY_ID;

  evaluate(request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome {
    const { chain } = context;
    const terminalAuthority = chain.delegations[0] ?? chain.grants[0];

    if (!terminalAuthority) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'NO_AUTHORITY_TO_CHECK_SCOPE',
        reason: 'There is no resolved authority to check resource scope against.',
      };
    }

    if (!isInScope(request.resourceScope, terminalAuthority.resourceScopes)) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'RESOURCE_SCOPE_NOT_GRANTED',
        reason: `Resource ${request.resourceScope} is outside the resource scopes granted to actor ${request.actorId}.`,
        decisionType: 'scope_expansion_detected',
      };
    }

    for (let i = 0; i < chain.delegations.length; i += 1) {
      const delegation = chain.delegations[i];
      const parent = chain.delegations[i + 1] ?? chain.grants[0];
      if (!delegation || !parent) {
        continue;
      }
      const exceedsParentScope = !delegation.resourceScopes.every((scope) => isInScope(scope, parent.resourceScopes));
      if (exceedsParentScope) {
        return {
          policyId: POLICY_ID,
          passed: false,
          reasonCode: 'DELEGATION_SCOPE_EXCEEDS_PARENT',
          reason: `Delegation grant ${delegation.id} carries resource scopes not contained in its source authority.`,
          decisionType: 'scope_expansion_detected',
        };
      }
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'RESOURCE_SCOPE_CONTAINED',
      reason: `Resource ${request.resourceScope} is within the resolved authority's granted scope.`,
    };
  }
}
