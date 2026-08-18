import {
  governedAuthorityReservationReducesAvailability,
  type GovernedAuthorityAvailability,
  type GovernedAuthorityPosition,
  type GovernedAuthorityReservation,
} from '@aoc-enterprise/governed-authority';
import { governedRightsScopeSum, serializeGovernedRightsScope, type GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

import { computeDigest } from '../governance-store/digest.js';
import { AuthorityGovernanceError } from './errors.js';
import { subtractAuthorityScope } from './lifecycle.js';

/**
 * The rules deciding what a reservation may be and when capacity is still
 * available, expressed once as pure functions over records — the same
 * arrangement `lifecycle.ts` uses for positions and transitions, and for the
 * same reason: the in-memory and SQLite stores must not drift into two
 * different notions of availability, or the shared contract suite proves
 * nothing about the durable one.
 *
 * Every scope comparison and every scope addition goes through
 * `governedRightsScopeSum` and `subtractAuthorityScope`. No arithmetic on
 * `basisPoints` or `units` happens here: those primitives already encode the
 * kind-refusal and denomination-refusal semantics the four governed actions
 * agreed on, and re-deriving them would re-derive the escalation they exist to
 * prevent.
 */

// ---------------------------------------------------------------------------
// Which governed actions commit underlying authority.
//
// One coherent semantic location, rather than an `if (action === 'TRANSFER')`
// repeated through the runtime. The classification is measured from what each
// action actually does to a `GovernedAuthorityPosition`, not from its name:
//
//   TRANSFER        CONSERVING     records a governed-execution transition that
//                                  debits the transferor. Authorized scope that
//                                  has not moved yet is finite capacity another
//                                  authorization must not also promise.
//
//   TOKENIZE        NON-CONSERVING never calls the authority store. Its scope
//                                  bounds an issuance ceiling inside the
//                                  mandate; executing it debits no position, so
//                                  there is no capacity for a reservation to
//                                  protect.
//
//   COLLATERALIZE   NON-CONSERVING never calls the authority store either. Its
//                                  `committedScope` accumulates *within one
//                                  mandate*, and a reported release does not
//                                  decrement it. What it creates is a
//                                  long-lived encumbrance that outlives
//                                  execution — which a pre-execution
//                                  reservation cannot model, and must not
//                                  pretend to. See the ADR, "Long-lived
//                                  encumbrance boundary".
//
//   LICENSE         NON-CONSERVING never calls the authority store, and
//                                  frequently carries no scope at all. An
//                                  absent `rightsScope` is emphatically not
//                                  100%, so there is no quantity to commit;
//                                  licence scarcity (exclusivity, seat
//                                  ceilings, duration) is action-local policy,
//                                  not holder-authority accounting.
//
// A deployment that later makes one of the other three conserving adds it here,
// in one place, alongside the evidence for the change.
// ---------------------------------------------------------------------------

/** The capability vocabulary `GovernedAuthorityBasis`'s `governed-execution` variant already uses. */
export const GOVERNED_AUTHORITY_CONSERVING_ACTIONS: readonly string[] = ['transfer'];

/**
 * Whether authorizing this governed action commits a finite quantity of the
 * holder's underlying authority, and therefore requires a reservation before
 * the authorization artifact may exist.
 */
export function governedActionCommitsAuthority(action: string): boolean {
  return GOVERNED_AUTHORITY_CONSERVING_ACTIONS.includes(action);
}

// ---------------------------------------------------------------------------
// Availability.
// ---------------------------------------------------------------------------

/**
 * Sums the reservations that still reduce availability, or `null` when there
 * are none.
 *
 * `null` rather than a zero: a zero scope would have to name a kind and, for
 * unitized quantities, a denomination — and inventing one for "nothing is
 * committed" is exactly the synthetic quantity this model refuses elsewhere.
 * Callers treat `null` as "the whole position is available", which is the same
 * statement without the fabrication.
 */
export function sumActiveReservations(
  reservations: readonly GovernedAuthorityReservation[],
  at: string,
): GovernedRightsScope | null | 'incompatible' {
  let total: GovernedRightsScope | null = null;
  for (const reservation of reservations) {
    if (!governedAuthorityReservationReducesAvailability(reservation, at)) continue;
    if (total === null) {
      total = reservation.scope;
      continue;
    }
    const next = governedRightsScopeSum(total, reservation.scope);
    if (next === null) return 'incompatible';
    total = next;
  }
  return total;
}

/**
 * The availability verdict for one position and the commitments standing
 * against it.
 *
 * Never throws: availability is a *fact* about state, and an inconsistent
 * state is one of the facts it can report. Turning `overcommitted` into an
 * exception here would make an invariant breach indistinguishable from an
 * unreadable store, and the two need different responses.
 */
export function computeAvailability(
  position: GovernedAuthorityPosition | null,
  reservations: readonly GovernedAuthorityReservation[],
  at: string,
): GovernedAuthorityAvailability {
  if (position === null) return { outcome: 'no_authority' };

  const committed = sumActiveReservations(reservations, at);
  if (committed === 'incompatible') {
    return { outcome: 'incompatible', positionId: position.id, held: serializeGovernedRightsScope(position.scope) };
  }
  const held = serializeGovernedRightsScope(position.scope);
  if (committed === null) return { outcome: 'available', positionId: position.id, held, available: held };

  let available: GovernedRightsScope;
  try {
    available = subtractAuthorityScope(position.scope, committed, { positionId: position.id });
  } catch (error) {
    // The two ways the subtraction refuses are two different facts, and both
    // must reach the caller as facts rather than as a thrown store failure:
    // incommensurable quantities were never comparable, while a shortfall means
    // more capacity stands committed than the holder holds — an invariant
    // breach this runtime has no path to, and one that must be surfaced rather
    // than clamped to zero.
    const code = error instanceof AuthorityGovernanceError ? error.code : undefined;
    if (code === 'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE') {
      return { outcome: 'overcommitted', positionId: position.id, held, committed: serializeGovernedRightsScope(committed) };
    }
    return { outcome: 'incompatible', positionId: position.id, held };
  }

  return {
    outcome: 'available',
    positionId: position.id,
    held,
    committed: serializeGovernedRightsScope(committed),
    available: serializeGovernedRightsScope(available),
  };
}

// ---------------------------------------------------------------------------
// Integrity. The same canonical digest primitive positions and transitions use.
// ---------------------------------------------------------------------------

/** The exact bytes a reservation's digest covers. Every field that could be tampered with to free capacity, move a commitment onto another holder, or extend its life is in here; the digest itself obviously is not. */
export function projectReservationForDigest(reservation: Omit<GovernedAuthorityReservation, 'digest'>): Readonly<Record<string, unknown>> {
  return {
    id: reservation.id,
    tenantId: reservation.tenantId,
    holderRef: reservation.holderRef,
    resourceKind: reservation.resourceKind,
    resourceId: reservation.resourceId,
    governedRight: reservation.governedRight,
    scope: serializeGovernedRightsScope(reservation.scope),
    action: reservation.action,
    sourceRequestRef: reservation.sourceRequestRef,
    ...(reservation.sourceDecisionRef !== undefined ? { sourceDecisionRef: reservation.sourceDecisionRef } : {}),
    sourceMandateRef: reservation.sourceMandateRef,
    effectiveFrom: reservation.effectiveFrom,
    expiresAt: reservation.expiresAt,
    status: reservation.status,
    idempotencyKey: reservation.idempotencyKey,
    ...(reservation.correlationId !== undefined ? { correlationId: reservation.correlationId } : {}),
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
  };
}

export function computeReservationDigest(reservation: Omit<GovernedAuthorityReservation, 'digest'>): string {
  return computeDigest(projectReservationForDigest(reservation));
}

/**
 * Recomputes a reservation's digest on read and refuses a mismatch.
 *
 * Failing closed here means something specific and deliberate: a tampered
 * reservation row is *not* skipped as unreadable, because skipping it would
 * silently free the capacity it commits — turning a corrupted record into
 * exactly the double commitment this layer exists to prevent. The whole
 * availability question fails instead.
 */
export function assertReservationIntegrity(reservation: GovernedAuthorityReservation): GovernedAuthorityReservation {
  const { digest: _digest, ...rest } = reservation;
  if (computeReservationDigest(rest) !== reservation.digest) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_RESERVATION_RECORD_CORRUPTED',
      `Governed authority reservation '${reservation.id}' does not match its stored digest; refusing to compute availability from it.`,
      { reservationId: reservation.id },
    );
  }
  return reservation;
}

/**
 * Whether a replayed acquisition names the same commitment as the one already
 * recorded under its idempotency key.
 *
 * Every dimension that decides *which* capacity is committed is compared. A
 * key reused for a different holder, resource, right, quantity, action or
 * source mandate is a different commitment wearing the same name, and is
 * refused rather than reinterpreted — mirroring `assertReplayMatches` for
 * transitions and the representation store's conflict rule.
 */
export function reservationReplayMatches(
  existing: GovernedAuthorityReservation,
  candidate: {
    readonly holderRef: string;
    readonly resourceKind: string;
    readonly resourceId: string;
    readonly governedRight: string;
    readonly scope: GovernedRightsScope;
    readonly action: string;
    readonly sourceMandateRef: string;
  },
): boolean {
  return (
    existing.holderRef === candidate.holderRef &&
    existing.resourceKind === candidate.resourceKind &&
    existing.resourceId === candidate.resourceId &&
    existing.governedRight === candidate.governedRight &&
    existing.action === candidate.action &&
    existing.sourceMandateRef === candidate.sourceMandateRef &&
    JSON.stringify(serializeGovernedRightsScope(existing.scope)) === JSON.stringify(serializeGovernedRightsScope(candidate.scope))
  );
}

/** A reservation's id, derived from the tenant and the mandate whose commitment it is, so both backends name the same reservation and a duplicate is impossible to construct. */
export function deriveReservationId(tenantId: string, sourceMandateRef: string, governedRight: string): string {
  return `governed-authority-reservation-${computeDigest({ tenantId, sourceMandateRef, governedRight }).slice('sha256:'.length, 'sha256:'.length + 16)}`;
}
