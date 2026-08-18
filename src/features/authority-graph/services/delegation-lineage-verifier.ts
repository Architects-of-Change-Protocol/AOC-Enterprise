import {
  NO_DELEGATION_LINEAGE,
  lineageSourceFromDelegation,
  lineageSourceFromGrant,
  type DelegationLineageAssessment,
  type DelegationLineageBreach,
  type DelegationLineageSource,
} from '../domain/delegation-lineage.js';
import type { AuthorityChain } from '../domain/authority-chain.js';
import { MAX_ANCESTRY_HOPS } from './authority-resolver.js';
import type { AuthorityGraphStore } from './authority-graph-store.js';

/**
 * Walks a resolved chain's lineage against current store state and reports
 * whether it is a legitimate derivation.
 *
 * ## Why this is a separate walk from `AuthorityResolver`'s
 *
 * The resolver's job is to *find* an authority chain, and it is deliberately
 * forgiving: when a source id resolves to nothing it stops and returns what it
 * has, because a partial chain is still the most informative thing it can hand
 * a policy. That forgiveness was measurable as a hole -- a delegation naming a
 * source that does not exist arrived at the policy chain looking exactly like a
 * root, and every policy passed it. This walk asks the opposite question: not
 * "what can be assembled?" but "does what was assembled actually terminate at a
 * grant that names no parent of its own, without revisiting itself, without
 * changing hands, without gaining an action, and without exceeding what the
 * grant at the root was ever willing to permit?".
 *
 * ## Why it also walks the grant ancestry
 *
 * `IssuerAuthorityPolicy` requires the top grant in a chain to trace to a
 * registered root issuer -- but only when that grant names no parent, on the
 * assumption that a grant naming a parent will be judged through it. A grant
 * whose `parentGrantId` dangles satisfies neither branch and escapes the
 * requirement entirely, so an imported grant issued by an untrusted actor could
 * name a nonexistent parent and stand. Continuing through the grant ancestry
 * here closes that, and closes it for direct grant chains too -- which is why
 * this runs even when there are no delegations at all.
 *
 * ## Why the grant's ceilings are read rather than the delegation's
 *
 * `DelegationDepthPolicy` compares each delegation's `delegationDepth` against
 * its own `maxDelegationDepth`, and inspects `canRedelegate` on delegation
 * parents only. A forged record supplies both halves of that comparison, and
 * the root of a one-hop chain is a grant, not a delegation -- so a record
 * derived straight from a `canDelegate: false` grant, declaring whatever
 * ceiling it liked, passed. Only the grant knows how far it was ever willing to
 * be delegated, so the grant is what this asks.
 *
 * ## Why it is a projection rather than stored lineage
 *
 * Nothing computed here is written anywhere. Ancestor liveness, rootedness and
 * containment are re-derived from the store on every evaluation, so revoking or
 * removing an ancestor invalidates its whole subtree without a single
 * descendant row being rewritten.
 *
 * ## What it deliberately does not check
 *
 * Resource containment, revocation, suspension, expiry, non-delegable actions,
 * self-issuance and trust-domain crossing each already have a policy.
 * Re-deriving one of them here would put two answers in the codebase for one
 * question, which is the failure mode this phase exists to remove.
 */
export class DelegationLineageVerifier {
  constructor(private readonly store: AuthorityGraphStore) {}

  assess(chain: AuthorityChain): DelegationLineageAssessment {
    const chainRefs: string[] = [];
    const visited = new Set<string>();
    const terminalDepth = chain.delegations[0]?.delegationDepth ?? 0;

    let current = chain.delegations[0];
    let hops = 0;

    // Phase 1: the delegation hops, terminal first.
    while (current !== undefined) {
      if (hops > MAX_ANCESTRY_HOPS) return breached(chainRefs, { kind: 'beyond_policy_horizon', hops });
      if (visited.has(current.id)) return breached(chainRefs, { kind: 'cycle', delegationGrantId: current.id });
      visited.add(current.id);
      chainRefs.push(current.id);
      hops += 1;

      const source = this.resolveSource(current.sourceAuthorityGrantId);
      if (source === undefined) {
        return breached(chainRefs, {
          kind: 'source_missing',
          delegationGrantId: current.id,
          sourceAuthorityGrantId: current.sourceAuthorityGrantId,
        });
      }

      // Who issued the hop must be who held the thing it was issued from.
      // Without this, a record naming an arbitrary live delegation as its source
      // is indistinguishable from one its delegate actually created, and the
      // chain's shape stops meaning anything about who authorized whom.
      if (current.delegatorActorId !== source.holderActorId) {
        return breached(chainRefs, {
          kind: 'delegator_not_source_holder',
          delegationGrantId: current.id,
          delegatorActorId: current.delegatorActorId,
          sourceHolderActorId: source.holderActorId,
        });
      }

      if (!source.canDelegateFurther) {
        return breached(chainRefs, {
          kind: 'source_not_delegable',
          delegationGrantId: current.id,
          sourceAuthorityGrantId: source.id,
        });
      }

      const widerAction = current.actions.find((action) => !source.actions.includes(action));
      if (widerAction !== undefined) {
        return breached(chainRefs, { kind: 'action_expanded', delegationGrantId: current.id, action: widerAction });
      }

      if (source.kind === 'authority_grant') {
        // The grant at the root fixes how deep the whole subtree beneath it may
        // go. `terminalDepth` is the deepest hop's own claim, and it is the one
        // that has to fit.
        const ceiling = source.maxDelegationDepth ?? 0;
        if (terminalDepth > ceiling) {
          return breached(chainRefs, { kind: 'depth_exceeds_source', depth: terminalDepth, maxDelegationDepth: ceiling });
        }
        return this.assertGrantRooted(source.id, chainRefs, visited, hops);
      }

      current = this.store.getDelegation(source.id);
      if (current === undefined) {
        // Unreachable while `resolveSource` returned a delegation, and kept
        // because a store that answered twice differently is exactly the case
        // that must not fall through to `rooted: true`.
        return breached(chainRefs, { kind: 'source_missing', delegationGrantId: chainRefs[chainRefs.length - 1] ?? '', sourceAuthorityGrantId: source.id });
      }
    }

    // No delegations at all: a chain of direct grants, whose rootedness is
    // still worth proving for exactly the dangling-parent reason above.
    const rootGrant = chain.grants[0];
    if (rootGrant === undefined) return NO_DELEGATION_LINEAGE;
    return this.assertGrantRooted(rootGrant.id, chainRefs, visited, hops);
  }

  /** Walks `parentGrantId` to a grant that names no parent, refusing a link that dangles or repeats. */
  private assertGrantRooted(
    grantId: string,
    chainRefs: string[],
    visited: Set<string>,
    hops: number,
  ): DelegationLineageAssessment {
    let currentId = grantId;
    let walked = hops;

    for (;;) {
      if (walked > MAX_ANCESTRY_HOPS) return breached(chainRefs, { kind: 'beyond_policy_horizon', hops: walked });
      if (visited.has(currentId)) return breached(chainRefs, { kind: 'cycle', delegationGrantId: currentId });
      visited.add(currentId);
      chainRefs.push(currentId);
      walked += 1;

      const grant = this.store.getGrant(currentId);
      if (grant === undefined) {
        return breached(chainRefs, { kind: 'source_missing', delegationGrantId: currentId, sourceAuthorityGrantId: currentId });
      }
      if (grant.parentGrantId === undefined) return { rooted: true, breach: null, chainRefs };

      const parentId = grant.parentGrantId;
      if (this.store.getGrant(parentId) === undefined) {
        return breached(chainRefs, { kind: 'source_missing', delegationGrantId: grant.id, sourceAuthorityGrantId: parentId });
      }
      currentId = parentId;
    }
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
