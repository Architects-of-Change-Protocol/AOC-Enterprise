import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

/**
 * How much of a holder's underlying governed authority is already promised to
 * a still-live governed authorization that has not yet reached a terminal
 * state.
 *
 * ## The question this answers, and the three it does not
 *
 * ```
 * GovernedAuthorityPosition      how much underlying authority does Holder H possess?
 * GovernedRepresentativeAuthority who may exercise H's authority?
 * AuthorityGrant / delegation     through what lineage may a requester invoke the action?
 * GovernedAuthorityReservation    how much of H's authority is already committed?
 * ```
 *
 * Those are four independent facts and no two of them substitute. A valid
 * delegation reserves nothing; a valid representation reserves nothing; a
 * reservation authorizes nobody. What a reservation does, and the whole of
 * what it does, is reduce the authority still *available* for an additional
 * incompatible commitment:
 *
 * ```
 * available = held - the reservations that are still active
 * ```
 *
 * ## What it emphatically is not
 *
 * - **Not ownership.** The underlying authority stays with
 *   `GovernedAuthorityPosition.actorRef`. Nobody — not the requester, not the
 *   representative, not the mandate holder — owns a reservation's scope.
 * - **Not a transfer.** Acquiring one debits nothing, credits nothing, and
 *   produces no `GovernedAuthorityTransition`. Alice with 5 000 bp and a
 *   3 000 bp reservation still *holds* 5 000 bp; what changed is that only
 *   2 000 bp remains committable.
 * - **Not a mandate.** A mandate is the authorization artifact Enterprise
 *   issued. A reservation is the finite capacity that artifact relies on,
 *   accounted for so a competing artifact cannot rely on the same capacity.
 *   One reservation exists per mandate that needs one, and the mandate is
 *   named by `sourceMandateRef` — the reservation is not stored inside it,
 *   because mandate state and authority accounting live in different stores
 *   with different consistency boundaries.
 * - **Not a lock.** A database lock lives for milliseconds inside one
 *   transaction. This lives across process restarts for as long as an external
 *   executor may legitimately still act under the mandate.
 *
 * ## Why the reference is to the mandate rather than to a party
 *
 * There is deliberately no `ownerRef`, `reservedBy` or `beneficiaryRef`. A
 * reservation is system governance state produced by Enterprise's own
 * authorization orchestration, never something a requester asks for and never
 * something a party holds. Naming a party would invite exactly the reading
 * this record exists to prevent — that reserved capacity has been handed to
 * somebody. `sourceRequestRef`, `sourceDecisionRef` and `sourceMandateRef`
 * carry the lineage instead, so "why does this capacity stand committed?" is
 * answerable from the record without any of them implying entitlement.
 *
 * ## No stored expiry state
 *
 * `status` carries only what a governance act decided —
 * `'active' | 'consumed' | 'released'`. Expiry is *derived* from `expiresAt`
 * against the instant being asked about, exactly as
 * `governedAuthorityPositionState` derives a position's lifecycle and
 * `TransferMandateRecord` derives expiry rather than storing it. A stored
 * `'expired'` would be a second source of truth that a stopped cleanup process
 * could leave disagreeing with the clock — and it would make correctness
 * depend on a background sweeper, which is precisely the failure mode
 * `governedAuthorityReservationState` exists to rule out.
 */
export interface GovernedAuthorityReservation {
  readonly id: string;

  /** The organization whose governed authority is committed. Never crossed: a reservation in one tenant can never reduce availability in another. */
  readonly tenantId: string;

  /**
   * Whose underlying authority is committed — **not** who asked for it, and
   * **not** who may exercise it.
   *
   * A reservation created while a representative acts for Alice reduces
   * *Alice's* availability. The representative acquires nothing, and two
   * different representatives of the same holder draw on the same pool.
   */
  readonly holderRef: string;

  readonly resourceKind: string;
  readonly resourceId: string;

  readonly governedRight: GovernedRightType;

  /** How much of the holder's authority this commitment promises. Always present and always non-zero: a reservation of nothing would reduce no availability and record a commitment that was never made. */
  readonly scope: GovernedRightsScope;

  /** The governed action whose authorization this capacity is committed to, carried verbatim from the basis capability vocabulary (`'transfer'`). Recorded for audit; availability never consults it, because two commitments against the same right compete whatever action made them. */
  readonly action: string;

  /** The governed request that led to the commitment. The entry point into the lineage: request -> decision -> reservation -> mandate -> execution or release. */
  readonly sourceRequestRef: string;
  /** The Kernel decision that authorized it. */
  readonly sourceDecisionRef?: string;
  /** The authorization artifact this capacity stands committed to. The reservation ends when this mandate does — by execution, revocation or expiry — and never independently of it. */
  readonly sourceMandateRef: string;

  readonly effectiveFrom: string;
  /**
   * When the commitment lapses on its own.
   *
   * Required, unlike a position's optional `expiresAt`. A perpetual position
   * is an ordinary fact about authority; a perpetual *reservation* would strand
   * capacity forever behind a mandate that may never execute, so this record
   * cannot represent one. It is set from the mandate's own expiry, so a
   * reservation never outlives the commitment that justified it.
   */
  readonly expiresAt: string;

  readonly status: GovernedAuthorityReservationStatus;

  /** The key an acquisition is idempotent on. Re-acquiring under it returns the original reservation; re-using it for materially different terms is refused rather than reinterpreted. */
  readonly idempotencyKey: string;
  readonly correlationId?: string;

  readonly createdAt: string;
  readonly updatedAt: string;

  /** Tamper-evidence digest over this row, computed and owned by the store. Never supplied by a caller. */
  readonly digest: string;
}

/**
 * The four states a governance act can put a reservation in.
 *
 * ```
 * active      capacity stands committed; competing commitments must respect it
 * consumed    the governed execution applied the authority transition
 * encumbered  the governed execution created a persistent constraint instead
 * released    the commitment ended without the authority ever being committed further
 * ```
 *
 * All three terminal states stop reducing availability, and none of them is
 * collapsed into another, because they are three different facts an auditor
 * must be able to tell apart:
 *
 * - `consumed` — the position has *already been debited*. Continuing to
 *   subtract the reservation would count the same quantity twice, because the
 *   position itself now reflects the movement. `TRANSFER` ends here.
 * - `encumbered` — the position was **not** debited, and the capacity was not
 *   returned either. The commitment became a `GovernedAuthorityEncumbrance`,
 *   which now accounts for the same quantity persistently. Continuing to
 *   subtract the reservation as well would count one commitment twice.
 *   `COLLATERALIZE` ends here.
 * - `released` — nothing was ever committed downstream, so the capacity
 *   genuinely returns. A revoked or never-issued authorization ends here.
 *
 * `consumed` and `encumbered` are the two ways a commitment was *spent*, and
 * neither may be reopened: releasing either would fabricate capacity that
 * something else is already accounting for.
 */
export type GovernedAuthorityReservationStatus = 'active' | 'consumed' | 'encumbered' | 'released';

/**
 * What a reservation is at an instant: its stored status, or `'expired'` when
 * an active one has passed `expiresAt`.
 *
 * `expired` is checked before `active` so a lapsed reservation stops reducing
 * availability the moment the clock passes it, with no cleanup process
 * involved. Cleanup may still physically remove such rows; correctness never
 * depends on it having run.
 */
export type GovernedAuthorityReservationState = GovernedAuthorityReservationStatus | 'expired';

export function governedAuthorityReservationState(reservation: GovernedAuthorityReservation, at: string): GovernedAuthorityReservationState {
  if (reservation.status !== 'active') return reservation.status;
  return Date.parse(at) >= Date.parse(reservation.expiresAt) ? 'expired' : 'active';
}

/**
 * The single predicate that decides whether a reservation counts against
 * available authority.
 *
 * Kept as one function so no availability computation, no store and no test
 * can re-spell "still counts" and drift. A reservation that has not begun does
 * not count either: capacity committed from next week is not capacity spent
 * today.
 */
export function governedAuthorityReservationReducesAvailability(reservation: GovernedAuthorityReservation, at: string): boolean {
  if (governedAuthorityReservationState(reservation, at) !== 'active') return false;
  return Date.parse(at) >= Date.parse(reservation.effectiveFrom);
}

/**
 * The question an authorization asks before committing, and the closed set of
 * answers it can get.
 *
 * Deliberately a separate vocabulary from `GovernedAuthorityCoverage`. Coverage
 * answers "does the holder possess this?"; availability answers "is enough of
 * what the holder possesses still uncommitted?". Collapsing them would lose the
 * distinction the whole of this layer exists to draw — a holder who genuinely
 * possesses 5 000 bp and a holder with 5 000 bp of which 4 000 stands committed
 * are different situations with different remedies.
 */
export type GovernedAuthorityAvailability =
  | {
      readonly outcome: 'available';
      readonly positionId: string;
      /** What the holder possesses. Unchanged by any reservation and unchanged by any encumbrance. */
      readonly held: GovernedRightsScope;
      /**
       * The sum of every reservation still reducing availability, net of the
       * portion of it that has already become a persistent constraint under
       * the same authorization.
       *
       * That netting is what keeps one commitment counted once across the
       * handoff. A mandate that reserved 4 000 bp and has since encumbered all
       * 4 000 contributes nothing here and 4 000 to `encumbered`; a mandate
       * that reserved 4 000 and has encumbered 1 000 so far contributes the
       * 3 000 it may still execute, so the authorization it still carries
       * stays protected without the 1 000 being subtracted twice.
       *
       * Absent when there is none — never a synthesized zero, because a zero of
       * an unknown denomination is not a quantity AOC can produce.
       */
      readonly committed?: GovernedRightsScope;
      /** The sum of every encumbrance still constraining this authority. Absent when there are none, for the same reason. */
      readonly encumbered?: GovernedRightsScope;
      /** What can still be committed now: `held` less `committed` less `encumbered`. */
      readonly available: GovernedRightsScope;
    }
  /** No live position for this holder and right, so nothing is available and nothing can be committed. Includes the not-enrolled and exhausted cases; availability does not distinguish them, because coverage already does. */
  | { readonly outcome: 'no_authority' }
  /**
   * Active reservations sum to more than the position holds.
   *
   * Unreachable through any path in this runtime — every authority-reducing
   * operation goes through the same store — and reported rather than clamped
   * anyway. A negative availability silently treated as zero would hide an
   * invariant breach that an import, a restore or a tampered row could have
   * produced, and hiding it is how stranded or fabricated capacity becomes
   * permanent. Nothing may be committed against this state.
   */
  | { readonly outcome: 'overcommitted'; readonly positionId: string; readonly held: GovernedRightsScope; readonly committed: GovernedRightsScope }
  /**
   * Active *encumbrances* alone sum to more than the position holds.
   *
   * Kept apart from `overcommitted` rather than folded into it because the two
   * inconsistencies are different facts with different remedies. An
   * overcommitment is pre-execution and self-clearing — the reservations behind
   * it lapse at their own `expiresAt`. An overencumbrance is not: the
   * constraints behind it have no expiry, so the state persists until an
   * operator resolves it, and it means AOC is carrying persistent constraints
   * over authority the holder no longer possesses.
   *
   * Reported rather than clamped, for the same reason `overcommitted` is: a
   * negative availability silently treated as zero would hide an invariant
   * breach that an import, a restore, a privileged bootstrap or a tampered row
   * could have produced. Nothing may be committed against this state.
   */
  | { readonly outcome: 'overencumbered'; readonly positionId: string; readonly held: GovernedRightsScope; readonly encumbered: GovernedRightsScope }
  /** The position and the standing commitments are not commensurable quantities — a proportional position against unitized reservations, or two unit denominations AOC holds no conversion between. Never coerced; nothing may be committed. */
  | { readonly outcome: 'incompatible'; readonly positionId: string; readonly held: GovernedRightsScope };

/** True for the one outcome that lets a commitment be attempted. A function so no call site re-spells which outcomes are permissive, and so a future variant is a compile-time question rather than a silent widening. */
export function isGovernedAuthorityAvailable(availability: GovernedAuthorityAvailability): availability is Extract<GovernedAuthorityAvailability, { outcome: 'available' }> {
  return availability.outcome === 'available';
}
