import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

import type { GovernedRepresentativeBasis } from './governed-representative-basis.js';

/**
 * A holder-bound authorization for one party to exercise **another party's**
 * governed authority, within an explicitly bounded envelope.
 *
 * ## The question this answers, and the two it does not
 *
 * Soberanía Enterprise now distinguishes three authority questions that were
 * previously two:
 *
 * ```
 * AuthorityGrant / DelegationGrant   may this actor invoke action X on resource R?
 * GovernedAuthorityPosition          which governed right does this party control?
 * GovernedRepresentativeAuthority    may this actor exercise THAT party's authority?
 * ```
 *
 * The third was missing, and its absence was measurable rather than
 * theoretical. A delegated administrator holding a bare asset-scoped
 * `AuthorityGrant` — and holding no governed right whatsoever — could name any
 * party it liked as `governedAuthorityHolderRef` and have that party's
 * authority spent on its say-so, because the only two checks in the path asked
 * "may the administrator act on this asset?" and "does the named holder hold
 * enough?", and both were satisfiable independently. The inference
 *
 * > I may perform TRANSFER on Asset A, therefore I may choose whichever holder
 * > has enough rights
 *
 * had nothing standing against it. This record is what stands against it.
 *
 * ## What it asserts, bounded on purpose
 *
 * > According to the governance state this Soberanía Enterprise deployment
 * > recognizes, `representativeRef` may cause the holder `holderRef`'s
 * > authority over `governedRights` of the named resource to be exercised, for
 * > `actions`, up to `scopeLimit`, between `effectiveFrom` and `expiresAt`.
 *
 * It emphatically does **not** assert that the representative *holds*, *owns*,
 * or *beneficially acquires* any part of the holder's right. Creating,
 * revoking or exercising a representative authority changes no
 * `GovernedAuthorityPosition` at all — see the package README section "No
 * conservation". Underlying authority stays with the holder; representative
 * authority stays with the representative; a request combines the two for the
 * duration and scope of that one request and no longer.
 *
 * It is also not legal agency, power of attorney, or any status recognized
 * outside this deployment. The proposition is exactly as strong as the
 * governance state behind it, which is the same bound `GovernedAuthorityPosition`
 * and `AuthorityGrant` already accept.
 *
 * ## Why this is a separate record rather than a field somewhere
 *
 * Not on `GovernedAuthorityPosition`, because a holder's authority state must
 * not have to be rewritten — and its digest re-sealed — every time an
 * administrator changes. Not on `DelegationGrant`, because that record's
 * `delegatorActorId`/`delegateActorId`/`principalActorId` live in the
 * Recognition Runtime *actor* namespace while a holder is a *party reference*
 * that need not be an actor at all, because its `principalActorId` is
 * caller-supplied and validated against nothing, and because it carries no
 * governed right and no `GovernedRightsScope` to bind to. Not a string
 * convention inside `resourceScopes[]`, because the holder relationship is
 * semantics and must be typed.
 *
 * ## Ceiling, not reservation
 *
 * `scopeLimit` bounds what the representative may exercise. It reserves
 * nothing: if the holder later moves authority away directly, the
 * representative's usable amount falls with the holder's position, and no
 * record here is rewritten. The effective amount is always the intersection of
 * this ceiling and the holder's *current* position, resolved at request time.
 */
export interface GovernedRepresentativeAuthority {
  readonly id: string;

  /** The organization whose governance state this binding belongs to. Never crossed: a binding in one tenant proves nothing in another. */
  readonly tenantId: string;

  /**
   * The party whose governed authority may be exercised — the same reference
   * space as `GovernedAuthorityPosition.actorRef`, and deliberately so: this
   * value is matched against a position holder, not against an actor registry.
   */
  readonly holderRef: string;

  /**
   * The party that may exercise it — the same reference space as a governed
   * request's `requestedBy`/`actor.id`, because that is what it is compared
   * against at evaluation time.
   *
   * Never equal to `holderRef`. A party does not need permission to exercise
   * its own authority, and storing such a binding would suggest that it might.
   */
  readonly representativeRef: string;

  readonly resourceKind: string;
  readonly resourceId: string;

  /**
   * The governed rights this representation covers, explicitly enumerated.
   *
   * Never "all rights of the resource", and never inferred from one another:
   * representation over `economic-interest` says nothing whatever about
   * `ownership-interest`, even when the same holder controls both. An empty
   * list is refused rather than read as a wildcard.
   */
  readonly governedRights: readonly GovernedRightType[];

  /**
   * How much of each covered right the representative may engage.
   *
   * A discriminated union rather than an optional field, because "unbounded"
   * is a decision an issuer must *make* rather than a field an issuer may
   * forget. An omitted optional maximum would be the most permissive possible
   * binding and the easiest one to create by accident; this shape makes the
   * permissive case cost a deliberate word.
   *
   * `'unbounded'` imposes no numeric ceiling of its own. It is not "100%" and
   * not "everything the holder has forever" — the holder's current position
   * remains the hard cap at every instant, so an unbounded representative of a
   * holder who controls 2000 bp may exercise 2000 bp and not one more.
   */
  readonly scopeLimit: GovernedRepresentativeScopeLimit;

  /**
   * The governed actions this representation covers, as the same capability
   * identifiers `ActionDescriptor.type`/`capability` carry.
   *
   * Action-bound for the same reason the existing delegation machinery is:
   * being trusted to licence a holder's right is not being trusted to transfer
   * it away. An empty list is refused rather than read as a wildcard.
   */
  readonly actions: readonly string[];

  readonly effectiveFrom: string;
  /** Present only when the representation genuinely ends. Absent means open-ended, never "ends now". */
  readonly expiresAt?: string;

  /** Whether this representation may itself be redelegated onward. Redelegation never broadens any dimension — see `governedRepresentativeAuthorityContains`. */
  readonly canRedelegate: boolean;
  /** 0 for a root binding; parent's depth + 1 for a redelegated one. */
  readonly delegationDepth: number;
  /** The binding this one was redelegated from, if any. Evaluation walks to the root and requires every link to be live, so revoking an ancestor disables the whole subtree without rewriting it. */
  readonly parentRepresentativeAuthorityId?: string;

  /** Why this deployment recognizes the representation. A closed union: there is no self-assertion variant. */
  readonly basis: GovernedRepresentativeBasis;

  /**
   * When the representation was withdrawn, if it was.
   *
   * The one piece of lifecycle that genuinely cannot be derived from the other
   * fields — unlike `GovernedAuthorityPosition`, which deliberately stores no
   * status because every one of its states is a function of scope and time.
   * Revocation is an event, so it is recorded as one instant, and the *state*
   * remains derived from it. See `governedRepresentativeAuthorityState`.
   */
  readonly revokedAt?: string;

  readonly createdAt: string;
  readonly updatedAt: string;

  readonly correlationId?: string;

  /** Tamper-evidence digest over this row, computed and owned by the store. Never supplied by a caller. */
  readonly digest: string;
}

/**
 * The quantity ceiling a representation carries.
 *
 * Two variants and no third. `'bounded'` names an exact maximum in the
 * canonical `GovernedRightsScope` vocabulary, compared by containment rather
 * than by arithmetic, so a proportional ceiling never silently bounds a
 * unitized request. `'unbounded'` says the issuer deliberately set no numeric
 * limit of its own.
 */
export type GovernedRepresentativeScopeLimit =
  | { readonly kind: 'bounded'; readonly maximum: GovernedRightsScope }
  | { readonly kind: 'unbounded' };

/**
 * The lifecycle state of a representation at an instant.
 *
 * ```
 * revoked   revokedAt is set and has passed   withdrawn; nothing further may be exercised
 * pending   now < effectiveFrom               granted but not yet in force
 * expired   now >= expiresAt                  in force no longer
 * active    otherwise                         exercisable
 * ```
 *
 * `revoked` is checked first, because a revoked binding that also happens to
 * be outside its window should report the reason an operator actually acted
 * on.
 */
export type GovernedRepresentativeAuthorityState = 'pending' | 'active' | 'expired' | 'revoked';

export function governedRepresentativeAuthorityState(
  representation: GovernedRepresentativeAuthority,
  at: string,
): GovernedRepresentativeAuthorityState {
  const now = Date.parse(at);
  if (representation.revokedAt !== undefined && now >= Date.parse(representation.revokedAt)) return 'revoked';
  if (Number.isFinite(Date.parse(representation.effectiveFrom)) && now < Date.parse(representation.effectiveFrom)) return 'pending';
  if (representation.expiresAt !== undefined && now >= Date.parse(representation.expiresAt)) return 'expired';
  return 'active';
}

/**
 * Whether one scope ceiling is fully contained by another.
 *
 * `'unbounded'` contains everything; nothing but `'unbounded'` contains
 * `'unbounded'`. Bounded ceilings are compared with the canonical
 * `governedRightsScopeWithin`, so a proportional ceiling never bounds a
 * unitized one and two unit denominations are never coerced.
 *
 * Deliberately not a numeric `min`: the shared scope primitives already encode
 * the kind- and denomination-refusals four governed actions agreed on, and
 * re-deriving them here would re-derive the exact escalation they prevent.
 */
export function governedRepresentativeScopeLimitWithin(
  inner: GovernedRepresentativeScopeLimit,
  outer: GovernedRepresentativeScopeLimit,
  within: (inner: GovernedRightsScope, outer: GovernedRightsScope) => boolean,
): boolean {
  if (outer.kind === 'unbounded') return true;
  if (inner.kind === 'unbounded') return false;
  return within(inner.maximum, outer.maximum);
}

/** Why a proposed redelegation is not contained by its parent, or `null` when it is. One reason per dimension, so a refusal names the axis that was broadened rather than reporting "invalid". */
export type GovernedRepresentativeContainmentBreach =
  | { readonly dimension: 'holder'; readonly parent: string; readonly child: string }
  | { readonly dimension: 'resource'; readonly parent: string; readonly child: string }
  | { readonly dimension: 'right'; readonly governedRight: GovernedRightType }
  | { readonly dimension: 'action'; readonly action: string }
  | { readonly dimension: 'scope' }
  | { readonly dimension: 'effectiveFrom'; readonly parent: string; readonly child: string }
  | { readonly dimension: 'expiresAt'; readonly parent?: string; readonly child?: string };

/**
 * Every way a child representation could be wider than its parent, checked in
 * one place.
 *
 * Monotonicity across a redelegation chain is not one property but seven, and
 * each of them is a distinct laundering route: changing the holder would let
 * `Alice -> X -> Y` become "Y acts for Bob"; changing the resource, the right,
 * the action, the ceiling or either end of the validity window would each let a
 * narrow grant be reissued as a broad one by the party it was narrowed for.
 * Checking them together, from the records themselves, means no caller can
 * check six and forget the seventh.
 */
export function governedRepresentativeAuthorityContainmentBreach(
  parent: GovernedRepresentativeAuthority,
  child: {
    readonly holderRef: string;
    readonly resourceKind: string;
    readonly resourceId: string;
    readonly governedRights: readonly GovernedRightType[];
    readonly actions: readonly string[];
    readonly scopeLimit: GovernedRepresentativeScopeLimit;
    readonly effectiveFrom: string;
    readonly expiresAt?: string;
  },
  within: (inner: GovernedRightsScope, outer: GovernedRightsScope) => boolean,
): GovernedRepresentativeContainmentBreach | null {
  if (child.holderRef !== parent.holderRef) return { dimension: 'holder', parent: parent.holderRef, child: child.holderRef };
  if (child.resourceKind !== parent.resourceKind) return { dimension: 'resource', parent: parent.resourceKind, child: child.resourceKind };
  if (child.resourceId !== parent.resourceId) return { dimension: 'resource', parent: parent.resourceId, child: child.resourceId };

  const widerRight = child.governedRights.find((right) => !parent.governedRights.includes(right));
  if (widerRight !== undefined) return { dimension: 'right', governedRight: widerRight };

  const widerAction = child.actions.find((action) => !parent.actions.includes(action));
  if (widerAction !== undefined) return { dimension: 'action', action: widerAction };

  if (!governedRepresentativeScopeLimitWithin(child.scopeLimit, parent.scopeLimit, within)) return { dimension: 'scope' };

  // A child may start later than its parent and end earlier, never the
  // reverse: a redelegation must not be usable at an instant the authority it
  // derives from was not.
  if (Date.parse(child.effectiveFrom) < Date.parse(parent.effectiveFrom)) {
    return { dimension: 'effectiveFrom', parent: parent.effectiveFrom, child: child.effectiveFrom };
  }
  if (parent.expiresAt !== undefined && (child.expiresAt === undefined || Date.parse(child.expiresAt) > Date.parse(parent.expiresAt))) {
    return {
      dimension: 'expiresAt',
      ...(parent.expiresAt !== undefined ? { parent: parent.expiresAt } : {}),
      ...(child.expiresAt !== undefined ? { child: child.expiresAt } : {}),
    };
  }
  return null;
}
