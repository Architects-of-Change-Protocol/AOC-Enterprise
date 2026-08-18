import type { AuthorityGrant } from './authority-grant.js';
import type { DelegationGrant } from './delegation-grant.js';

/**
 * Why a resolved lineage is not a legitimate derivation of the authority it
 * claims to come from.
 *
 * One variant per axis rather than a single `invalid`, because each is a
 * different security failure and an operator's remedy differs for each. They
 * are deliberately *not* the axes the existing policy chain already covers --
 * resource containment, revocation, expiry and trust domain each have a policy
 * of their own and are not re-derived here.
 */
export type DelegationLineageBreach =
  /**
   * A hop names a source that resolves to nothing. The hop is an orphan: it
   * claims to derive from an authority this deployment has no record of, so
   * there is no envelope it can be shown to be inside.
   *
   * Raised for a dangling `AuthorityGrant.parentGrantId` as well as a dangling
   * `DelegationGrant.sourceAuthorityGrantId`. `IssuerAuthorityPolicy` skips its
   * accepted-root check whenever the top grant *has* a `parentGrantId`, on the
   * assumption that a grant naming a parent will be judged through that parent
   * -- so a grant naming a parent that does not exist would otherwise escape
   * the root-issuer requirement entirely.
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
  | { readonly kind: 'action_expanded'; readonly delegationGrantId: string; readonly action: string }
  /**
   * A delegation derives from an `AuthorityGrant` whose holder was never
   * permitted to delegate it.
   *
   * `DelegationDepthPolicy` cannot catch this: it inspects `canRedelegate` on
   * *delegation* parents only, and the root of a one-hop chain is a grant.
   */
  | { readonly kind: 'source_not_delegable'; readonly delegationGrantId: string; readonly sourceAuthorityGrantId: string }
  /**
   * The chain is deeper than the `AuthorityGrant` at its root permits.
   *
   * Checked against the *grant's* ceiling rather than the delegation's own
   * `maxDelegationDepth`, which is the point: a forged record supplies both its
   * depth and the limit it is compared against, so `DelegationDepthPolicy`'s
   * self-consistency check passes for any pair the forger likes. Only the grant
   * knows how far it was ever willing to be delegated.
   */
  | { readonly kind: 'depth_exceeds_source'; readonly depth: number; readonly maxDelegationDepth: number }
  /**
   * The lineage is longer than `AuthorityResolver` materializes into the chain
   * the policies see.
   *
   * Refused rather than accepted, because beyond that horizon this walk would
   * be asserting rootedness over hops that `AncestorRevocationPolicy`,
   * `AncestorExpirationPolicy` and `DelegationScopePolicy` never received and
   * therefore never judged. A lineage nothing else can inspect is not one this
   * component should vouch for.
   */
  | { readonly kind: 'beyond_policy_horizon'; readonly hops: number };

/**
 * What walking a chain's lineage established, resolved at evaluation time from
 * current store state.
 *
 * A projection and not a record. Nothing here is persisted, nothing is copied
 * into a child, and every field is recomputed on every evaluation -- which is
 * what makes revoking or deleting an ancestor take effect immediately, and what
 * keeps grant lifecycle owned by the grant rather than duplicated into its
 * descendants. It is the same discipline
 * `createGovernedRepresentationResolver` applies to representation chains.
 */
export interface DelegationLineageAssessment {
  /** Whether the walk terminated at an `AuthorityGrant` that names no parent of its own. */
  readonly rooted: boolean;
  /** The first breach found, or `null`. One rather than all: a chain is invalid at its first illegitimate hop, and reporting the rest would describe hops whose envelope was never established. */
  readonly breach: DelegationLineageBreach | null;
  /** Every hop actually walked, terminal first, root last. References only -- ids, never copies of the records. */
  readonly chainRefs: readonly string[];
}

/** A lineage that was not assessed because there was nothing to assess: no records at all. */
export const NO_DELEGATION_LINEAGE: DelegationLineageAssessment = { rooted: true, breach: null, chainRefs: [] };

/**
 * The authority a hop derives from, reduced to what lineage validation reads:
 * who holds it, what it permits, whether it may be delegated, and how far.
 *
 * Both `AuthorityGrant` and `DelegationGrant` can be a source -- that is what
 * `sourceAuthorityGrantId` means -- and this is what they have in common.
 */
export interface DelegationLineageSource {
  readonly id: string;
  readonly holderActorId: string;
  readonly actions: readonly string[];
  readonly kind: 'authority_grant' | 'delegation_grant';
  /** `canDelegate` for a grant, `canRedelegate` for a delegation. */
  readonly canDelegateFurther: boolean;
  /** The deepest delegation this source ever permitted beneath it. Absent on a delegation, whose own ceiling is not authoritative -- see `depth_exceeds_source`. */
  readonly maxDelegationDepth?: number;
}

export function lineageSourceFromGrant(grant: AuthorityGrant): DelegationLineageSource {
  return {
    id: grant.id,
    holderActorId: grant.subjectActorId,
    actions: grant.actions,
    kind: 'authority_grant',
    canDelegateFurther: grant.canDelegate,
    ...(grant.maxDelegationDepth !== undefined ? { maxDelegationDepth: grant.maxDelegationDepth } : {}),
  };
}

export function lineageSourceFromDelegation(delegation: DelegationGrant): DelegationLineageSource {
  return {
    id: delegation.id,
    holderActorId: delegation.delegateActorId,
    actions: delegation.actions,
    kind: 'delegation_grant',
    canDelegateFurther: delegation.canRedelegate,
  };
}
