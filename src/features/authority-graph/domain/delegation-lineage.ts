import type { AuthorityGrant } from './authority-grant.js';
import type { DelegationGrant } from './delegation-grant.js';

/**
 * Why a resolved delegation lineage is not a legitimate derivation of the
 * authority it claims to come from.
 *
 * One variant per axis rather than a single `invalid`, because the four causes
 * below are four different security failures and an operator's remedy differs
 * for each. They are deliberately *not* the axes the existing policy chain
 * already covers -- resource containment, depth, redelegability, revocation,
 * expiry and trust domain each have a policy of their own and are not
 * re-derived here.
 */
export type DelegationLineageBreach =
  /**
   * A hop names a source that resolves to nothing. The hop is an orphan: it
   * claims to derive from an authority this deployment has no record of, so
   * there is no envelope it can be shown to be inside.
   */
  | { readonly kind: 'source_missing'; readonly delegationGrantId: string; readonly sourceAuthorityGrantId: string }
  /**
   * Following sources revisited a hop already on the path. A cycle is not a
   * root: authority that only ever justifies itself has no origin, and the
   * traversal guard that stops the walk must not be mistaken for a verdict.
   */
  | { readonly kind: 'cycle'; readonly delegationGrantId: string }
  /**
   * A hop was issued by an actor that does not hold the authority it claims to
   * have delegated from. This is the lineage equivalent of `IssuerAuthorityPolicy`'s
   * check on grants, which stops at the grant chain and never reaches delegations.
   */
  | {
      readonly kind: 'delegator_not_source_holder';
      readonly delegationGrantId: string;
      readonly delegatorActorId: string;
      readonly sourceHolderActorId: string;
    }
  /**
   * A hop carries an action its source does not. `DelegationScopePolicy` proves
   * this for `resourceScopes` and has never proved it for `actions`, so a record
   * that entered the store by any route other than `DelegationService` could
   * broaden what it was permitted to do.
   */
  | { readonly kind: 'action_expanded'; readonly delegationGrantId: string; readonly action: string };

/**
 * What walking a chain's delegation lineage established, resolved at
 * evaluation time from current store state.
 *
 * A projection and not a record. Nothing here is persisted, nothing is copied
 * into a child, and every field is recomputed on every evaluation -- which is
 * what makes revoking or deleting an ancestor take effect immediately, and what
 * keeps grant lifecycle owned by the grant rather than duplicated into its
 * descendants. It is the same discipline
 * `createGovernedRepresentationResolver` applies to representation chains.
 */
export interface DelegationLineageAssessment {
  /** Whether the walk terminated at a real `AuthorityGrant`. A chain with no delegations is trivially rooted. */
  readonly rooted: boolean;
  /** The first breach found, or `null`. One rather than all: a chain is invalid at its first illegitimate hop, and reporting the rest would describe hops whose envelope was never established. */
  readonly breach: DelegationLineageBreach | null;
  /** Every hop actually walked, terminal first, root last. References only -- ids, never copies of the records. */
  readonly chainRefs: readonly string[];
}

/** A lineage that was not assessed because there was nothing to assess: no delegation hops at all. */
export const NO_DELEGATION_LINEAGE: DelegationLineageAssessment = { rooted: true, breach: null, chainRefs: [] };

/**
 * The authority a delegation hop derives from, reduced to the three things
 * lineage validation reads: who holds it, what it permits, and what it is.
 *
 * Both `AuthorityGrant` and `DelegationGrant` can be a source -- that is what
 * `sourceAuthorityGrantId` means -- and this is what they have in common.
 */
export interface DelegationLineageSource {
  readonly id: string;
  readonly holderActorId: string;
  readonly actions: readonly string[];
  readonly kind: 'authority_grant' | 'delegation_grant';
}

export function lineageSourceFromGrant(grant: AuthorityGrant): DelegationLineageSource {
  return { id: grant.id, holderActorId: grant.subjectActorId, actions: grant.actions, kind: 'authority_grant' };
}

export function lineageSourceFromDelegation(delegation: DelegationGrant): DelegationLineageSource {
  return { id: delegation.id, holderActorId: delegation.delegateActorId, actions: delegation.actions, kind: 'delegation_grant' };
}
