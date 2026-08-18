import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext, AuthorityPolicyOutcome } from '../domain/authority-chain.js';
import type { DelegationLineageBreach } from '../domain/delegation-lineage.js';

const POLICY_ID = 'delegation_lineage_valid';

/**
 * Delegated authority must be traceable to a real source, through hops that
 * each actually changed hands and none of which gained an action.
 *
 * The three policies around this one each assume the chain they are handed is a
 * chain. `AncestorRevocationPolicy` asks whether the ancestors it can see are
 * live, `DelegationDepthPolicy` whether the depths add up, `DelegationScopePolicy`
 * whether the resources narrow -- and all three pass a delegation whose source
 * does not exist at all, because a chain with a dangling ancestor simply has
 * fewer records in it and every one of those records looks fine. Measured before
 * this existed: a delegation naming a nonexistent source was `authority_valid`,
 * a cycle was `authority_valid`, and a hop whose delegator had never held the
 * thing it delegated was `authority_valid`.
 *
 * Placed after revocation and expiry and before scope: an ancestor that is
 * revoked should say so rather than report the structural consequence, while a
 * chain that never terminated anywhere should be refused before its narrowing
 * is discussed.
 */
export class DelegationLineagePolicy implements AuthorityPolicy {
  readonly id = POLICY_ID;

  evaluate(request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome {
    const { lineage } = context;

    if (lineage.breach === null && lineage.rooted) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'DELEGATION_LINEAGE_VALID',
        reason:
          lineage.chainRefs.length === 0
            ? `Actor ${request.actorId} reached ${request.action} without delegation, so there is no lineage to prove.`
            : `Every hop from ${request.actorId} back to the root authority is accounted for.`,
      };
    }

    if (lineage.breach === null) {
      // Not rooted and no breach named. Unreachable today, and refused rather
      // than trusted: an unexplained lineage is not an established one.
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'DELEGATION_LINEAGE_UNROOTED',
        reason: `The delegation chain behind ${request.actorId} does not terminate at a recognized authority grant.`,
        decisionType: 'delegation_lineage_broken',
      };
    }

    return { policyId: POLICY_ID, passed: false, ...describe(lineage.breach) };
  }
}

/** One reason code and one sentence per breach kind, so a denial names the axis that failed rather than reporting "invalid lineage". */
function describe(breach: DelegationLineageBreach): Pick<AuthorityPolicyOutcome, 'reasonCode' | 'reason' | 'decisionType'> {
  switch (breach.kind) {
    case 'source_missing':
      return {
        reasonCode: 'DELEGATION_SOURCE_AUTHORITY_MISSING',
        reason: `Delegation grant ${breach.delegationGrantId} derives from ${breach.sourceAuthorityGrantId}, which this deployment holds no record of.`,
        decisionType: 'delegation_lineage_broken',
      };
    case 'cycle':
      return {
        reasonCode: 'DELEGATION_LINEAGE_CYCLE',
        reason: `Delegation grant ${breach.delegationGrantId} is reached from itself, so its authority has no origin.`,
        decisionType: 'delegation_lineage_broken',
      };
    case 'delegator_not_source_holder':
      return {
        reasonCode: 'DELEGATOR_DOES_NOT_HOLD_SOURCE_AUTHORITY',
        reason: `Delegation grant ${breach.delegationGrantId} was issued by ${breach.delegatorActorId}, but its source authority is held by ${breach.sourceHolderActorId}.`,
        decisionType: 'issuer_not_authorized',
      };
    case 'action_expanded':
      return {
        reasonCode: 'DELEGATION_ACTION_EXCEEDS_PARENT',
        reason: `Delegation grant ${breach.delegationGrantId} carries action ${breach.action}, which its source authority does not permit.`,
        decisionType: 'scope_expansion_detected',
      };
  }
}
