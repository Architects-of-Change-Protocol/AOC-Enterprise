import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext, AuthorityPolicyOutcome } from '../domain/authority-chain.js';

const POLICY_ID = 'non_delegable_action_denied';

/**
 * Some actions -- sending a final invoice, approving a payment, signing a
 * contract, changing a bank account -- can never be delegated, no matter how
 * legitimate the rest of the chain looks.
 */
export class NonDelegableActionPolicy implements AuthorityPolicy {
  readonly id = POLICY_ID;

  evaluate(request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome {
    const { chain } = context;

    if (chain.delegations.length === 0) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'ACTION_NOT_DELEGATED',
        reason: `Action ${request.action} was not reached through delegation.`,
      };
    }

    const violatingEntity = [...chain.delegations, ...chain.grants].find((entity) =>
      entity.nonDelegableActions?.includes(request.action),
    );

    if (violatingEntity) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'ACTION_NON_DELEGABLE',
        reason: `Action ${request.action} is marked non-delegable by ${violatingEntity.id} and cannot be exercised through delegation.`,
        decisionType: 'non_delegable_action',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'ACTION_DELEGABLE',
      reason: `Action ${request.action} is not restricted from delegation.`,
    };
  }
}
