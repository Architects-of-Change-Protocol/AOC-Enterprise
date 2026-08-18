import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

/**
 * What AOC Enterprise currently recognizes one actor as being able to exercise
 * over one governed right of one governed resource.
 *
 * ## What a position asserts, and what it emphatically does not
 *
 * A `GovernedAuthorityPosition` asserts exactly this, and nothing wider:
 *
 * > According to the governance state and evidence this AOC Enterprise
 * > deployment recognizes, `actorRef` has authority to exercise `scope` of
 * > `governedRight` over the resource, from `effectiveFrom` until
 * > `expiresAt`.
 *
 * It does **not** assert legal title, statutory ownership, registry truth,
 * beneficial interest, or recognition by any authority outside this
 * deployment. There is deliberately no `OwnershipRecord`, `LegalOwner`,
 * `TitleRegistry` or `currentHolder` anywhere in this package: AOC evaluates
 * configured authority and accepted evidence, and a deployment whose evidence
 * is wrong holds a position that is wrong in exactly the same way its
 * `AuthorityGrant`s already could be. The proposition is bounded on purpose —
 * it is strong enough for AOC's own subsequent enforcement and weak enough to
 * be true.
 *
 * A position is also **not** a mandate and **not** an `AuthorityGrant`:
 *
 * ```
 * GovernedAuthorizationArtifact   was action X authorized?
 * AuthorityGrant                  may this actor call action X at all?
 * GovernedAuthorityPosition       what governed right does this actor control?
 * ```
 *
 * The first is produced by one decision and never changes. The second is
 * issued administratively and scopes *calling*. This is the third question,
 * which neither of the other two could answer, and it is the one a completed
 * `TRANSFER` changes.
 *
 * ## Identity and merging
 *
 * A position is identified by `(tenantId, actorRef, resourceKind, resourceId,
 * governedRight)` — see `governedAuthorityPositionKey`. Crediting an actor
 * that already holds the same right of the same resource **merges** into the
 * one position using the canonical `governedRightsScopeSum`, rather than
 * creating a second lot: 1000 bp plus 2500 bp is one position of 3500 bp, and
 * "how much does Alice control" must have exactly one answer. Provenance is
 * not lost by merging, because it lives in the append-only
 * `GovernedAuthorityTransition` history rather than in the position.
 *
 * Two scopes of different kinds, or unitized scopes of different
 * denominations, are *not* merged and *not* coerced — the credit is refused.
 * That refusal is inherited directly from `governedRightsScopeSum` returning
 * `null`, and it is the reason this record stores a `GovernedRightsScope`
 * rather than a bare number.
 *
 * ## No stored status
 *
 * There is deliberately no `status` field. Every lifecycle state a position
 * can be in is a total function of `scope`, `effectiveFrom`, `expiresAt` and
 * the current instant — see `governedAuthorityPositionState`. A stored status
 * would be a second source of truth that could disagree with the scope it
 * describes, which is precisely the class of bug an exhausted-but-still-active
 * row would be.
 */
export interface GovernedAuthorityPosition {
  readonly id: string;

  /** The organization whose governance state this position belongs to. Never crossed: no transition may debit one tenant and credit another. */
  readonly tenantId: string;

  /**
   * The party AOC recognizes as controlling this right. A party reference of
   * the same kind the action terms use (`transferorRef`, `licenseeRef`, ...),
   * not necessarily a Recognition Runtime actor: the holder of an economic
   * interest need not be an actor that can call anything, and the actor that
   * calls on its behalf need not hold anything.
   */
  readonly actorRef: string;

  readonly resourceKind: string;
  readonly resourceId: string;

  readonly governedRight: GovernedRightType;

  /** How much of the right is currently recognized. Never negative: a debit that would take it below zero is refused rather than clamped. */
  readonly scope: GovernedRightsScope;

  readonly effectiveFrom: string;
  /** Present only when this authority genuinely ends. Absent means perpetual, never "ends now". */
  readonly expiresAt?: string;

  readonly createdAt: string;
  readonly updatedAt: string;

  /** The `GovernedAuthorityTransition` that most recently created or changed this position — the entry point into its provenance chain. */
  readonly lastTransitionRef: string;

  /** Tamper-evidence digest over this row, computed and owned by the store. Never supplied by a caller. */
  readonly digest: string;
}

/** The tuple that identifies a position. Scope kind is deliberately *not* part of it: a denomination change is an incompatibility to refuse, never a second position to open. */
export interface GovernedAuthorityPositionKey {
  readonly tenantId: string;
  readonly actorRef: string;
  readonly resourceKind: string;
  readonly resourceId: string;
  readonly governedRight: GovernedRightType;
}

/** Renders a position key as a stable, collision-resistant string for keyed lookup. Lengths are prefixed so no combination of separators in the parts can forge another key. */
export function governedAuthorityPositionKey(key: GovernedAuthorityPositionKey): string {
  const parts = [key.tenantId, key.actorRef, key.resourceKind, key.resourceId, key.governedRight];
  return parts.map((part) => `${part.length}:${part}`).join('|');
}

/**
 * The lifecycle state of a position at an instant, derived rather than stored.
 *
 * ```
 * pending     now < effectiveFrom      authority exists but has not started
 * expired     now >= expiresAt         authority has ended
 * exhausted   scope is zero            authority started, and nothing is left
 * active      otherwise                authority is exercisable
 * ```
 *
 * `expired` is checked before `exhausted` so an expired empty position reports
 * the reason that is actually load-bearing for a denial.
 */
export type GovernedAuthorityPositionState = 'pending' | 'active' | 'exhausted' | 'expired';

export function governedAuthorityPositionState(position: GovernedAuthorityPosition, at: string): GovernedAuthorityPositionState {
  const now = Date.parse(at);
  if (Number.isFinite(Date.parse(position.effectiveFrom)) && now < Date.parse(position.effectiveFrom)) return 'pending';
  if (position.expiresAt !== undefined && now >= Date.parse(position.expiresAt)) return 'expired';
  return isZeroGovernedRightsScope(position.scope) ? 'exhausted' : 'active';
}

/** True when a scope carries no quantity at all. The one place "nothing left" is spelled, so `exhausted` and a refused debit agree by construction. */
export function isZeroGovernedRightsScope(scope: GovernedRightsScope): boolean {
  return scope.kind === 'proportional' ? scope.basisPoints === 0 : scope.units === 0;
}
