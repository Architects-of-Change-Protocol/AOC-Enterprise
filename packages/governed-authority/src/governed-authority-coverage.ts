import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

/**
 * The one question the enforcement path asks of governed authority state, and
 * the closed set of answers it can get back.
 *
 * This pair is the whole contract between the Kernel and whatever holds
 * authority state. The Kernel learns a verdict and the facts behind it; it
 * learns nothing about positions, transitions, tables, tenancy guards or
 * digests. That boundary is what keeps this a source of richer *authority
 * facts* for the existing decision engine rather than a second decision
 * engine — `AocKernel` remains the only thing in Soberanía Enterprise that decides.
 */
export interface GovernedAuthorityQuery {
  readonly tenantId: string;

  /**
   * Whose authority is being drawn on — **not** necessarily who is asking.
   *
   * These come apart constantly and conflating them is the bug this field
   * exists to prevent: a portfolio manager submits a transfer of Party A's
   * economic interest, so the Authority Graph must authorize the *manager* to
   * act while this layer must confirm that *Party A* holds what is moving.
   * Neither check substitutes for the other, and a delegated administrator
   * never acquires the holder's underlying right by acting for it.
   */
  readonly holderRef: string;

  readonly resourceKind: string;
  readonly resourceId: string;

  readonly governedRight: GovernedRightType;

  /**
   * How much of the right the action is trying to engage, when the action
   * expresses a quantity at all.
   *
   * Absent means the action's own contract does not fractionally express this
   * right — `LICENSE`'s optional `rightsScope` is the real case. Absent is
   * emphatically **not** 100%: an absent scope requires the holder to hold
   * *some* live authority over the right and asserts nothing about how much,
   * which is exactly what "a permission drawing on a right it does not
   * quantify" means. Reading absence as the whole would silently authorize
   * every licence against a 1 bp position.
   */
  readonly requestedScope?: GovernedRightsScope;

  /** The instant to evaluate at. Positions that have not started, and positions that have ended, do not cover anything. */
  readonly at: string;
}

/**
 * Why a coverage question was answered the way it was.
 *
 * Six variants, each of which a deployment can act on differently and none of
 * which is inferable from another. `resource_not_enrolled` in particular is
 * not a denial and not a coverage: it is the honest statement that this
 * deployment holds no governed authority state for the resource at all, which
 * is the situation every existing deployment is in and which the caller — not
 * this vocabulary — decides what to do about.
 */
export type GovernedAuthorityCoverage =
  | { readonly outcome: 'covered'; readonly positionId: string; readonly available: GovernedRightsScope }
  /** No position of any right exists for this resource in this tenant. The resource has not been enrolled in right-scoped authority. */
  | { readonly outcome: 'resource_not_enrolled' }
  /** The resource is enrolled, but this holder has no live position for this right. Includes the exhausted case: nothing left is not authority. */
  | { readonly outcome: 'no_right_authority'; readonly governedRight: GovernedRightType }
  /** A live position exists and is smaller than what was asked for. */
  | { readonly outcome: 'insufficient_scope'; readonly positionId: string; readonly available: GovernedRightsScope; readonly requested: GovernedRightsScope }
  /** A position exists but its quantity is not commensurable with the request — a proportional share against a unit count, or two unit denominations Soberanía holds no conversion between. Never coerced; always refused. */
  | { readonly outcome: 'incompatible_scope'; readonly positionId: string; readonly available: GovernedRightsScope; readonly requested: GovernedRightsScope }
  /** A position exists for this holder and right, but not at the instant asked about — it has ended, or has not begun. */
  | { readonly outcome: 'expired'; readonly positionId: string };

/** True for the one outcome that lets an action proceed. Kept as a function so no call site has to re-spell which outcomes are permissive, and so adding a variant is a compile-time question rather than a silent widening. */
export function isGovernedAuthorityCovered(coverage: GovernedAuthorityCoverage): boolean {
  return coverage.outcome === 'covered';
}

/**
 * The narrow port the Kernel consumes. Asynchronous because a real
 * implementation reads a durable store, and returning one coverage per query
 * because an action naming three rights asks three independent questions —
 * batching them here would invite an implementation that answers "mostly".
 */
export interface GovernedAuthorityProviderPort {
  resolveGovernedAuthority(query: GovernedAuthorityQuery): Promise<GovernedAuthorityCoverage>;
}
