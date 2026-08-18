import {
  NO_DELEGATION_LINEAGE,
  lineageSourceFromDelegation,
  lineageSourceFromGrant,
  type DelegationLineageAssessment,
  type DelegationLineageBreach,
  type DelegationLineageSource,
} from '../domain/delegation-lineage.js';
import type { AuthorityChain } from '../domain/authority-chain.js';
import type { AuthorityGraphStore } from './authority-graph-store.js';

/**
 * How many hops the walk will follow before refusing the chain outright.
 *
 * A fail-safe and not the semantic answer: cycles are detected by identity
 * below, and creation-time validation already refuses the detectable ones. This
 * exists so a store corrupted into a shape the cycle check cannot see still
 * terminates, and terminates closed.
 */
const MAX_LINEAGE_HOPS = 64;

/**
 * Walks a resolved chain's delegation lineage against current store state and
 * reports whether it is a legitimate derivation.
 *
 * ## Why this is a separate walk from `AuthorityResolver`'s
 *
 * The resolver's job is to *find* an authority chain, and it is deliberately
 * forgiving: when a source id resolves to nothing it stops and returns what it
 * has, because a partial chain is still the most informative thing it can hand
 * a policy. That forgiveness was measurable as a hole -- a delegation naming a
 * source that does not exist arrived at the policy chain looking exactly like a
 * root, and every policy passed it. This walk asks the opposite question:
 * not "what can be assembled?" but "does what was assembled actually terminate
 * at a real grant, without revisiting itself, without changing hands, and
 * without gaining an action along the way?".
 *
 * ## Why it is a projection rather than stored lineage
 *
 * Nothing computed here is written anywhere. Ancestor liveness, rootedness and
 * containment are re-derived from the store on every evaluation, so revoking or
 * removing an ancestor invalidates its whole subtree without a single
 * descendant row being rewritten -- the property `GovernedRepresentativeAuthority`
 * already relies on, applied to the capability chain.
 *
 * ## What it deliberately does not check
 *
 * Resource containment, delegation depth, redelegability, revocation,
 * suspension, expiry, non-delegable actions, self-issuance and trust-domain
 * crossing each already have a policy. Re-deriving one of them here would put
 * two answers in the codebase for one question, which is the failure mode this
 * phase exists to remove.
 */
export class DelegationLineageVerifier {
  constructor(private readonly store: AuthorityGraphStore) {}

  assess(chain: AuthorityChain): DelegationLineageAssessment {
    if (chain.delegations.length === 0) {
      // A chain of direct grants has no delegation lineage to prove. Its own
      // rootedness is `IssuerAuthorityPolicy`'s question, not this one, and
      // answering it twice would let the two answers disagree.
      return NO_DELEGATION_LINEAGE;
    }

    const chainRefs: string[] = [];
    const visited = new Set<string>();
    let current = chain.delegations[0];
    if (current === undefined) return NO_DELEGATION_LINEAGE;

    for (let hop = 0; hop < MAX_LINEAGE_HOPS; hop += 1) {
      if (visited.has(current.id)) {
        return breached(chainRefs, { kind: 'cycle', delegationGrantId: current.id });
      }
      visited.add(current.id);
      chainRefs.push(current.id);

      const source = this.resolveSource(current.sourceAuthorityGrantId);
      if (source === undefined) {
        return breached(chainRefs, {
          kind: 'source_missing',
          delegationGrantId: current.id,
          sourceAuthorityGrantId: current.sourceAuthorityGrantId,
        });
      }

      // Who issued the hop must be who held the thing it was issued from.
      // Without this, a record naming an arbitrary live delegation as its source is
      // indistinguishable from one its delegate actually created, and the
      // chain's shape stops meaning anything about who authorized whom.
      if (current.delegatorActorId !== source.holderActorId) {
        return breached(chainRefs, {
          kind: 'delegator_not_source_holder',
          delegationGrantId: current.id,
          delegatorActorId: current.delegatorActorId,
          sourceHolderActorId: source.holderActorId,
        });
      }

      const widerAction = current.actions.find((action) => !source.actions.includes(action));
      if (widerAction !== undefined) {
        return breached(chainRefs, { kind: 'action_expanded', delegationGrantId: current.id, action: widerAction });
      }

      if (source.kind === 'authority_grant') {
        chainRefs.push(source.id);
        return { rooted: true, breach: null, chainRefs };
      }

      const next = this.store.getDelegation(source.id);
      if (next === undefined) {
        // Unreachable while `resolveSource` returned a delegation, and kept
        // because a store that answered twice differently is exactly the case
        // that must not fall through to `rooted: true`.
        return breached(chainRefs, { kind: 'source_missing', delegationGrantId: current.id, sourceAuthorityGrantId: source.id });
      }
      current = next;
    }

    // The hop budget ran out. Treated as a cycle rather than as a valid deep
    // chain: a lineage this long has not been shown to terminate anywhere.
    return breached(chainRefs, { kind: 'cycle', delegationGrantId: current.id });
  }

  private resolveSource(sourceAuthorityGrantId: string): DelegationLineageSource | undefined {
    const grant = this.store.getGrant(sourceAuthorityGrantId);
    if (grant !== undefined) return lineageSourceFromGrant(grant);
    const delegation = this.store.getDelegation(sourceAuthorityGrantId);
    if (delegation !== undefined) return lineageSourceFromDelegation(delegation);
    return undefined;
  }
}

function breached(chainRefs: readonly string[], breach: DelegationLineageBreach): DelegationLineageAssessment {
  return { rooted: false, breach, chainRefs };
}
