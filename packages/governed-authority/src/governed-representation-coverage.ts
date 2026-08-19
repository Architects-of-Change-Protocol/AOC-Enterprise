import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

/**
 * The one question the enforcement path asks about holder-bound
 * representation, and the closed set of answers it can get back.
 *
 * Deliberately a *second* port beside `GovernedAuthorityProviderPort` rather
 * than a widening of it. The two answer genuinely different questions — "does
 * this holder hold it?" and "may this requester spend it?" — they fail for
 * disjoint reasons, a deployment may configure one without the other, and
 * folding them would force a single coverage union to carry two independent
 * verdicts and invite an implementation that answers "mostly". Keeping them
 * apart is also what lets a denial say which of the two proofs was missing,
 * which is the whole point of requiring both.
 *
 * Like its sibling, this is a source of *facts* and not a decision engine.
 * `AocKernel` remains the only thing in Soberanía Enterprise that decides.
 */
export interface GovernedRepresentationQuery {
  readonly tenantId: string;

  /** The party making the request — `action.requestedBy` / `actor.id`. */
  readonly representativeRef: string;

  /**
   * The party whose governed authority the request would draw on.
   *
   * When this equals `representativeRef` the answer is `not_required` and no
   * binding is consulted: a holder does not delegate to itself, and demanding
   * that it should would make the direct path harder than the delegated one.
   */
  readonly holderRef: string;

  readonly resourceKind: string;
  readonly resourceId: string;

  /** The governed right this request engages. One question per right, as with authority coverage: an action naming two rights needs representation over both. */
  readonly governedRight: GovernedRightType;

  /**
   * How much of the right the action engages, when the action expresses a
   * quantity at all.
   *
   * Absent means the action does not fractionally express this right —
   * `LICENSE`'s optional `rightsScope` again. Absent is **not** 100% here
   * either: an unquantified permission is not a quantity, so a bounded
   * representative ceiling neither covers it by arithmetic nor blocks it.
   * A live representation over the right covers it.
   */
  readonly requestedScope?: GovernedRightsScope;

  /** The governed action being invoked, matched against the binding's `actions`. */
  readonly action: string;

  readonly at: string;
}

/**
 * Why a representation question was answered the way it was.
 *
 * The variants are finer-grained than the Kernel's public reason vocabulary on
 * purpose. A compact set of reason codes is what an integrator programs
 * against; this is what a reviewer reads to see *which* dimension of a
 * holder-bound envelope the request fell outside, and the security-relevant
 * causes — wrong holder, wrong right, wrong action, over ceiling, withdrawn —
 * must stay distinguishable even where they map onto one code.
 */
export type GovernedRepresentationCoverage =
  /** The requester is the holder. No representation is needed and none was consulted. */
  | { readonly outcome: 'not_required' }
  /** A live binding covers the request. `chain` is the binding and its ancestors, root last, so a reviewer can see the whole delegation path that authorized it. */
  | { readonly outcome: 'represented'; readonly representativeAuthorityId: string; readonly chain: readonly string[] }
  /** Nothing at all binds this requester to this holder for this resource. The central denial: it is what stops a delegated administrator from naming an arbitrary holder. */
  | { readonly outcome: 'no_representation' }
  /** A binding exists between these two parties for this resource, but it does not cover this governed right. */
  | { readonly outcome: 'right_not_represented'; readonly representativeAuthorityId: string; readonly governedRight: GovernedRightType }
  /** A binding exists and covers the right, but not this action. */
  | { readonly outcome: 'action_not_represented'; readonly representativeAuthorityId: string; readonly action: string }
  /** A binding covers the right and action, and its ceiling is smaller than the request. */
  | { readonly outcome: 'scope_exceeded'; readonly representativeAuthorityId: string; readonly permitted: GovernedRightsScope; readonly requested: GovernedRightsScope }
  /** A binding's ceiling is not commensurable with the request — a proportional ceiling against a unit count, or two denominations Soberanía holds no conversion between. Never coerced; always refused. */
  | { readonly outcome: 'incompatible_scope'; readonly representativeAuthorityId: string; readonly permitted: GovernedRightsScope; readonly requested: GovernedRightsScope }
  /** A covering binding exists but not at this instant — it has ended, or has not begun. */
  | { readonly outcome: 'expired'; readonly representativeAuthorityId: string }
  /** A covering binding exists and was withdrawn. */
  | { readonly outcome: 'revoked'; readonly representativeAuthorityId: string }
  /** A covering binding exists, but the thing it rests on no longer holds — its parent representation was revoked, or the `DelegationGrant` it was grounded in is no longer live. Resolved dynamically, never copied into this store. */
  | { readonly outcome: 'basis_withdrawn'; readonly representativeAuthorityId: string; readonly reason: 'parent_revoked' | 'delegation_not_live' };

/**
 * True for the outcomes that let an action proceed.
 *
 * Two of them, and the second one matters: `not_required` is a pass, because a
 * holder acting on its own authority needs no representation and never did.
 * Kept as a function so no call site re-spells which outcomes are permissive,
 * and so a new variant is a compile-time question rather than a silent
 * widening.
 */
export function isGovernedRepresentationCovered(coverage: GovernedRepresentationCoverage): boolean {
  return coverage.outcome === 'represented' || coverage.outcome === 'not_required';
}

/**
 * The narrow port the Kernel consumes. Asynchronous because a real
 * implementation reads a durable store and may walk a delegation chain, and
 * one coverage per query for the same reason its authority sibling does.
 */
export interface GovernedRepresentationProviderPort {
  resolveGovernedRepresentation(query: GovernedRepresentationQuery): Promise<GovernedRepresentationCoverage>;
}
