import {
  governedAuthorityEncumbranceConstrains,
  governedAuthorityReservationReducesAvailability,
  type GovernedAuthorityAvailability,
  type GovernedAuthorityEncumbrance,
  type GovernedAuthorityEncumbranceReleaseBasis,
  type GovernedAuthorityEncumbranceReleaseBasisKind,
  type GovernedAuthorityPosition,
  type GovernedAuthorityReservation,
} from '@aoc-enterprise/governed-authority';
import {
  governedRightsScopeSum,
  governedRightsScopeWithin,
  serializeGovernedRightsScope,
  type GovernedRightsScope,
} from '@aoc-enterprise/governed-authorization';

import { computeDigest } from '../governance-store/digest.js';
import { AuthorityGovernanceError } from './errors.js';
import { subtractAuthorityScope } from './lifecycle.js';

/**
 * The rules deciding what a persistent constraint may be, and how much of a
 * holder's authority is left unconstrained — expressed once as pure functions
 * over records, the same arrangement `lifecycle.ts` uses for positions and
 * `reservation-lifecycle.ts` uses for commitments, and for the same reason:
 * the in-memory and SQLite stores must not drift into two different notions of
 * capacity, or the shared contract suite proves nothing about the durable one.
 *
 * Every scope comparison, addition and subtraction goes through
 * `governedRightsScopeSum`, `governedRightsScopeWithin` and
 * `subtractAuthorityScope`. No arithmetic on `basisPoints` or `units` happens
 * here: those primitives already encode the kind-refusal and
 * denomination-refusal semantics the four governed actions agreed on, and
 * re-deriving them would re-derive the escalation they exist to prevent.
 */

// ---------------------------------------------------------------------------
// Which governed actions leave a persistent constraint behind.
//
// The companion to `GOVERNED_AUTHORITY_CONSERVING_ACTIONS`, and deliberately a
// *different* list rather than a wider reading of the same one. The two
// classifications answer different questions:
//
//   conserving   does executing this action debit a GovernedAuthorityPosition?
//   encumbering  does executing this action leave the holder's authority
//                persistently constrained without debiting it?
//
// Measured from what each action does, not from its name:
//
//   TRANSFER        CONSERVING, NOT ENCUMBERING
//                   `applyTransition` debits the transferor and credits the
//                   transferee. The new position *is* the new reality, so
//                   there is nothing left over to constrain: a persistent
//                   constraint on top of the debit would subtract the same
//                   movement twice.
//
//   COLLATERALIZE   ENCUMBERING, NOT CONSERVING
//                   executing it debits no position — Alice still holds her
//                   5 000 bp — but the arrangement the executor created
//                   outlives the mandate, and the scope it committed must not
//                   be promised again. Its mandate-local `committedScope`
//                   cannot see across mandates, which is the gap this list
//                   closes.
//
//   TOKENIZE        NEITHER, currently. Never calls the authority store; its
//                   scope bounds an issuance ceiling inside one mandate.
//                   Whether independent mandates should compete for one
//                   issuance pool is a tokenization-domain question, and
//                   answering it here would be inventing that domain's policy
//                   inside generic accounting.
//
//   LICENSE         NEITHER. Never calls the authority store, and its own
//                   contract records that licensed units deliberately do not
//                   accumulate — ten seats to one licensee and ten to another
//                   exhaust nothing about the asset. An absent `rightsScope`
//                   is emphatically not 100%, so there is no quantity to
//                   constrain.
//
// A deployment that later makes one of the other two encumbering adds it here,
// in one place, alongside the evidence for the change.
// ---------------------------------------------------------------------------

/** The capability vocabulary `GovernedAuthorityBasis`'s `governed-execution` variant already uses. */
export const GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS: readonly string[] = ['collateralize'];

/**
 * Whether a successful execution of this governed action leaves a persistent
 * constraint on the holder's authority, and therefore must convert its
 * pre-execution commitment into a `GovernedAuthorityEncumbrance` rather than
 * releasing it.
 */
export function governedActionEncumbersAuthority(action: string): boolean {
  return GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS.includes(action);
}

// ---------------------------------------------------------------------------
// Which governed actions may terminalize a persistent constraint.
//
// The third classification in this file, and deliberately a *third* list
// rather than a reading of either of the other two. The three answer different
// questions:
//
//   conserving   does executing this action debit a GovernedAuthorityPosition?
//   encumbering  does executing this action leave the holder's authority
//                persistently constrained without debiting it?
//   releasing    does executing this action end such a constraint, so the
//                authority it held becomes committable again?
//
// Nothing is on more than one of them, and nothing should be. An action that
// both created and ended constraints would be able to launder one into the
// other; an action that conserved *and* released would be moving authority and
// freeing it in the same step.
//
// Exactly one entry, and the narrowness is the point. `'release-encumbrance'`
// is the fifth governed action, introduced by this phase, and it is the only
// action whose successful execution Soberanía will accept as grounds for a
// `'governed-execution'` release basis. `'collateralize'` is emphatically not
// here: an arrangement's own mandate cannot discharge the constraint that
// arrangement created, or the constraint would be worth nothing.
//
// Kept as a literal for the same reason `GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS`
// keeps `'collateralize'` as one: this module is the generic authority
// accounting layer and must not depend on any action module. The canonical
// constant is `ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY` in
// `../encumbrance-release-governance/contracts.ts`, and the two are held
// together by `src/enterprise/__tests__/governed-encumbrance-release-scenario.test.ts`.
// ---------------------------------------------------------------------------

/** The capability vocabulary `GovernedAuthorityBasis`'s `governed-execution` variant already uses. */
export const GOVERNED_AUTHORITY_RELEASING_ACTIONS: readonly string[] = ['release-encumbrance'];

/**
 * Whether a successful execution of this governed action may terminalize a
 * persistent constraint. Anything else naming itself in a
 * `'governed-execution'` release basis is refused, so "some action executed"
 * can never become "the constraint is over".
 */
export function governedActionReleasesEncumbrance(action: string): boolean {
  return GOVERNED_AUTHORITY_RELEASING_ACTIONS.includes(action);
}

/**
 * Refuses a release basis that is not grounds for ending *this* constraint,
 * before any status is written.
 *
 * Shared by both store backends so neither can drift into a laxer reading, and
 * expressed over the stored constraint rather than over anything the caller
 * restated: everything checkable here is checked against the record Soberanía
 * already holds.
 *
 * What it enforces, and why each one is load-bearing:
 *
 * - **A `'governed-execution'` basis must name a releasing action.** Otherwise
 *   any executed mandate of any action would be grounds for a discharge.
 * - **An `'administrative'` basis must name an actor and a reason code.** An
 *   override nobody is named for cannot be reviewed afterwards.
 * - **Neither may be empty-stringed into existence.** A blank reference is not
 *   a reference.
 *
 * What it deliberately does *not* enforce here is that the named mandate and
 * execution exist and target this constraint: this module holds no mandates,
 * and asserting it from here would mean the generic accounting layer taking a
 * dependency on one action's store. That check is the release service's, made
 * against the artifacts themselves before it ever calls the store, and the
 * store's own defence is narrower and structural — one execution reference
 * terminalizes at most one constraint (`assertReleaseExecutionUnclaimed`).
 */
export function assertEncumbranceReleaseBasisAcceptable(
  basis: GovernedAuthorityEncumbranceReleaseBasis,
  context: Readonly<Record<string, unknown>>,
): void {
  if (basis.kind === 'governed-execution') {
    if (!governedActionReleasesEncumbrance(basis.action)) {
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_ENCUMBRANCE_RELEASE_BASIS_INVALID',
        `'${basis.action}' is not classified as releasing a persistent governed authority constraint; only ${GOVERNED_AUTHORITY_RELEASING_ACTIONS.join(', ')} may terminalize one.`,
        { ...context, action: basis.action },
      );
    }
    if (!isNonEmpty(basis.mandateRef) || !isNonEmpty(basis.executionRef)) {
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_ENCUMBRANCE_RELEASE_BASIS_INVALID',
        'A governed-execution release basis must name both the release mandate it ran under and the confirmed execution it is rooted in.',
        context,
      );
    }
    return;
  }

  if (!isNonEmpty(basis.assertedBy) || !isNonEmpty(basis.reasonCode)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_ENCUMBRANCE_RELEASE_BASIS_INVALID',
      'An administrative release basis must name the operator asserting it and a reason code; a privileged override that records neither cannot be reviewed afterwards.',
      context,
    );
  }
}

function isNonEmpty(value: string): boolean {
  return typeof value === 'string' && value.length > 0;
}

/**
 * The release lineage fields a basis projects onto the stored record.
 *
 * One place, so the two backends cannot disagree about which fields a basis
 * writes, and so an added variant cannot be persisted half-way by one of them.
 */
export function projectReleaseBasis(basis: GovernedAuthorityEncumbranceReleaseBasis): {
  readonly releaseBasis: GovernedAuthorityEncumbranceReleaseBasisKind;
  readonly releaseAction?: string;
  readonly releaseMandateRef?: string;
  readonly releaseExecutionRef?: string;
  readonly releasedBy?: string;
  readonly releaseReasonCode?: string;
} {
  return basis.kind === 'governed-execution'
    ? {
        releaseBasis: 'governed-execution',
        releaseAction: basis.action,
        releaseMandateRef: basis.mandateRef,
        releaseExecutionRef: basis.executionRef,
      }
    : { releaseBasis: 'administrative', releasedBy: basis.assertedBy, releaseReasonCode: basis.reasonCode };
}

/**
 * Whether a replayed terminalization is the same one already recorded.
 *
 * A constraint that is already `'released'` is returned unchanged when the
 * basis matches — the idempotency every store operation here offers — and
 * refused when it does not. Refusing matters: a second, *different* discharge
 * arriving for a constraint that is already terminal is a conflict a caller
 * needs to see, not a no-op to swallow, because it means two release
 * lifecycles both believe they discharged the same thing.
 */
export function encumbranceReleaseReplayMatches(
  existing: GovernedAuthorityEncumbrance,
  basis: GovernedAuthorityEncumbranceReleaseBasis,
): boolean {
  const projected = projectReleaseBasis(basis);
  return (
    existing.releaseBasis === projected.releaseBasis &&
    existing.releaseAction === projected.releaseAction &&
    existing.releaseMandateRef === projected.releaseMandateRef &&
    existing.releaseExecutionRef === projected.releaseExecutionRef &&
    existing.releasedBy === projected.releasedBy &&
    existing.releaseReasonCode === projected.releaseReasonCode
  );
}

// ---------------------------------------------------------------------------
// Capacity.
// ---------------------------------------------------------------------------

/**
 * Sums the encumbrances that still constrain this authority, or `null` when
 * there are none.
 *
 * `null` rather than a zero, for the same reason `sumActiveReservations`
 * returns one: a zero scope would have to name a kind and, for unitized
 * quantities, a denomination, and inventing one for "nothing is constrained"
 * is exactly the synthetic quantity this model refuses everywhere else.
 */
export function sumActiveEncumbrances(
  encumbrances: readonly GovernedAuthorityEncumbrance[],
  at: string,
): GovernedRightsScope | null | 'incompatible' {
  let total: GovernedRightsScope | null = null;
  for (const encumbrance of encumbrances) {
    if (!governedAuthorityEncumbranceConstrains(encumbrance, at)) continue;
    if (total === null) {
      total = encumbrance.scope;
      continue;
    }
    const next = governedRightsScopeSum(total, encumbrance.scope);
    if (next === null) return 'incompatible';
    total = next;
  }
  return total;
}

/**
 * Sums the reservations that still reduce capacity, **net of the scope each
 * one has already handed over to a persistent constraint**.
 *
 * This is the single rule that keeps one commitment counted once across the
 * reservation -> encumbrance handoff, and it is worth being precise about why a
 * naive sum is wrong in both directions.
 *
 * A `COLLATERALIZE` mandate reserves the scope it authorizes and then executes,
 * possibly in several instalments where its terms permit them. At the moment
 * an instalment's encumbrance exists, part of that mandate's reserved capacity
 * has become persistent and part has not:
 *
 * ```
 * reserved 4 000, encumbered 0       -> the reservation contributes 4 000
 * reserved 4 000, encumbered 1 000   -> the reservation contributes 3 000,
 *                                       the encumbrance contributes 1 000
 * reserved 4 000, encumbered 4 000   -> the reservation contributes nothing;
 *                                       it is terminal
 * ```
 *
 * Summing the reservation gross would subtract the encumbered instalment twice
 * and understate capacity. Dropping the reservation entirely on the first
 * instalment would free the 3 000 the mandate may still legitimately execute,
 * let a competitor take it, and leave Soberanía unable to record the constraint when
 * that execution arrives — a persistent arrangement existing externally with no
 * governed state behind it. Netting is the only reading that is right at every
 * point of the lifecycle.
 *
 * An encumbrance wider than the reservation it derives from contributes a
 * residual of nothing rather than a negative: the encumbrance's own full scope
 * is counted separately, so the commitment is never *under*-counted, and
 * `overencumbered` reports the breach if the total exceeds the position.
 */
export function sumActiveReservationsNetOfEncumbrances(
  reservations: readonly GovernedAuthorityReservation[],
  encumbrances: readonly GovernedAuthorityEncumbrance[],
  at: string,
): GovernedRightsScope | null | 'incompatible' {
  let total: GovernedRightsScope | null = null;
  for (const reservation of reservations) {
    if (!governedAuthorityReservationReducesAvailability(reservation, at)) continue;

    const carvedOut = sumActiveEncumbrances(
      encumbrances.filter(
        (encumbrance) =>
          encumbrance.sourceMandateRef === reservation.sourceMandateRef && encumbrance.governedRight === reservation.governedRight,
      ),
      at,
    );
    if (carvedOut === 'incompatible') return 'incompatible';

    let residual: GovernedRightsScope = reservation.scope;
    if (carvedOut !== null) {
      try {
        residual = subtractAuthorityScope(reservation.scope, carvedOut, { reservationId: reservation.id });
      } catch (error) {
        // The two ways the subtraction refuses mean opposite things here, and
        // collapsing them would fail open on the one that matters.
        //
        // A shortfall means the constraints under this mandate have wholly
        // covered — or overtaken — what it committed, so the commitment has
        // nothing left to protect. Skipping it under-counts nothing: each of
        // those constraints is counted in full, separately, by
        // `sumActiveEncumbrances`.
        //
        // Incommensurability means the two quantities were never comparable, so
        // no residual can be derived at all. Skipping *that* would silently free
        // exactly the capacity the commitment holds, so the whole capacity
        // question refuses instead.
        const code = error instanceof AuthorityGovernanceError ? error.code : undefined;
        if (code === 'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE') continue;
        return 'incompatible';
      }
      if (isEmptyScope(residual)) continue;
    }

    if (total === null) {
      total = residual;
      continue;
    }
    const next = governedRightsScopeSum(total, residual);
    if (next === null) return 'incompatible';
    total = next;
  }
  return total;
}

/** Whether a scope quantifies nothing. A residual of zero must not be summed in — not because it would change a total, but because a zero of one kind meeting a quantity of another would report `incompatible` for two commitments that never conflicted. */
function isEmptyScope(scope: GovernedRightsScope): boolean {
  return scope.kind === 'proportional' ? scope.basisPoints === 0 : scope.units === 0;
}

/**
 * The capacity verdict for one position, the commitments standing against it,
 * and the constraints persisting over it.
 *
 * Never throws: capacity is a *fact* about state, and an inconsistent state is
 * one of the facts it can report. Turning `overcommitted` or `overencumbered`
 * into an exception here would make an invariant breach indistinguishable from
 * an unreadable store, and the two need different responses.
 *
 * The two inconsistencies are tested in a deliberate order. `overencumbered` is
 * decided first, on the encumbrances alone, because it is the more serious and
 * the more specific fact: constraints that outrun the position do not lapse on
 * their own, so reporting them as a generic overcommitment would point an
 * operator at reservations that will clear themselves and away from the state
 * that will not.
 */
export function computeCapacity(
  position: GovernedAuthorityPosition | null,
  reservations: readonly GovernedAuthorityReservation[],
  encumbrances: readonly GovernedAuthorityEncumbrance[],
  at: string,
): GovernedAuthorityAvailability {
  if (position === null) return { outcome: 'no_authority' };

  const held = serializeGovernedRightsScope(position.scope);

  const encumbered = sumActiveEncumbrances(encumbrances, at);
  if (encumbered === 'incompatible') return { outcome: 'incompatible', positionId: position.id, held };

  let afterEncumbrances = position.scope;
  if (encumbered !== null) {
    try {
      afterEncumbrances = subtractAuthorityScope(position.scope, encumbered, { positionId: position.id });
    } catch (error) {
      const code = error instanceof AuthorityGovernanceError ? error.code : undefined;
      if (code === 'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE') {
        return { outcome: 'overencumbered', positionId: position.id, held, encumbered: serializeGovernedRightsScope(encumbered) };
      }
      return { outcome: 'incompatible', positionId: position.id, held };
    }
  }

  const committed = sumActiveReservationsNetOfEncumbrances(reservations, encumbrances, at);
  if (committed === 'incompatible') return { outcome: 'incompatible', positionId: position.id, held };

  if (committed === null) {
    return {
      outcome: 'available',
      positionId: position.id,
      held,
      ...(encumbered !== null ? { encumbered: serializeGovernedRightsScope(encumbered) } : {}),
      available: serializeGovernedRightsScope(afterEncumbrances),
    };
  }

  let available: GovernedRightsScope;
  try {
    available = subtractAuthorityScope(afterEncumbrances, committed, { positionId: position.id });
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
    ...(encumbered !== null ? { encumbered: serializeGovernedRightsScope(encumbered) } : {}),
    available: serializeGovernedRightsScope(available),
  };
}

/**
 * Whether a proposed remaining position would still cover the constraints that
 * stay attached to this holder.
 *
 * The structural invariant, and it is worth being exact about what it is not.
 * It is **not** the business rule "collateralized authority cannot be
 * transferred": a holder with 5 000 bp and a 4 000 bp constraint may still
 * transfer 1 000. It is the narrower, structural claim that Soberanía may not end up
 * holding a persistent constraint over authority the holder no longer
 * possesses — because such a record refers to nothing, and every capacity
 * question asked afterwards reports `overencumbered`.
 *
 * Constraints do **not** follow the authority to the recipient. Moving them
 * would be a substantive decision about what an encumbrance means when the
 * underlying right changes hands, and this phase deliberately does not make
 * it; refusing the transition that would strand them is the conservative
 * reading, and it leaves the eventual policy free to choose either way.
 */
export function assertRemainingScopeCoversEncumbrances(
  remaining: GovernedRightsScope,
  encumbrances: readonly GovernedAuthorityEncumbrance[],
  at: string,
  context: Readonly<Record<string, unknown>>,
): void {
  const constrained = sumActiveEncumbrances(encumbrances, at);
  if (constrained === null) return;
  if (constrained === 'incompatible') {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
      'The persistent constraints standing over this governed authority are not commensurable with each other; refusing to decide whether a transition would leave them covered.',
      context,
    );
  }
  if (!governedRightsScopeWithin(constrained, remaining)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_ENCUMBRANCE_UNCOVERED',
      'This transition would leave the holder with less governed authority than the persistent constraints already standing over it; Soberanía does not hold a constraint over authority a holder no longer possesses, and does not silently move one to a recipient.',
      { ...context, remaining: serializeGovernedRightsScope(remaining), encumbered: serializeGovernedRightsScope(constrained) },
    );
  }
}

// ---------------------------------------------------------------------------
// Integrity. The same canonical digest primitive positions, transitions and
// reservations use.
// ---------------------------------------------------------------------------

/** The exact bytes an encumbrance's digest covers. Every field that could be tampered with to free constrained capacity, move a constraint onto another holder, right or resource, or forge either its creation basis or its release basis is in here; the digest itself obviously is not. The release lineage fields are all conditional, so a row that never carried them projects byte-identically to how it did before they existed — which is what makes them a purely additive schema change rather than a rewrite of history. */
export function projectEncumbranceForDigest(encumbrance: Omit<GovernedAuthorityEncumbrance, 'digest'>): Readonly<Record<string, unknown>> {
  return {
    id: encumbrance.id,
    tenantId: encumbrance.tenantId,
    holderRef: encumbrance.holderRef,
    resourceKind: encumbrance.resourceKind,
    resourceId: encumbrance.resourceId,
    governedRight: encumbrance.governedRight,
    scope: serializeGovernedRightsScope(encumbrance.scope),
    sourceAction: encumbrance.sourceAction,
    sourceMandateRef: encumbrance.sourceMandateRef,
    sourceExecutionRef: encumbrance.sourceExecutionRef,
    ...(encumbrance.sourceReservationRef !== undefined ? { sourceReservationRef: encumbrance.sourceReservationRef } : {}),
    effectiveFrom: encumbrance.effectiveFrom,
    status: encumbrance.status,
    ...(encumbrance.releasedAt !== undefined ? { releasedAt: encumbrance.releasedAt } : {}),
    ...(encumbrance.releaseBasis !== undefined ? { releaseBasis: encumbrance.releaseBasis } : {}),
    ...(encumbrance.releaseAction !== undefined ? { releaseAction: encumbrance.releaseAction } : {}),
    ...(encumbrance.releaseMandateRef !== undefined ? { releaseMandateRef: encumbrance.releaseMandateRef } : {}),
    ...(encumbrance.releaseExecutionRef !== undefined ? { releaseExecutionRef: encumbrance.releaseExecutionRef } : {}),
    ...(encumbrance.releasedBy !== undefined ? { releasedBy: encumbrance.releasedBy } : {}),
    ...(encumbrance.releaseReasonCode !== undefined ? { releaseReasonCode: encumbrance.releaseReasonCode } : {}),
    idempotencyKey: encumbrance.idempotencyKey,
    ...(encumbrance.correlationId !== undefined ? { correlationId: encumbrance.correlationId } : {}),
    createdAt: encumbrance.createdAt,
    updatedAt: encumbrance.updatedAt,
  };
}

export function computeEncumbranceDigest(encumbrance: Omit<GovernedAuthorityEncumbrance, 'digest'>): string {
  return computeDigest(projectEncumbranceForDigest(encumbrance));
}

/**
 * Recomputes an encumbrance's digest on read and refuses a mismatch.
 *
 * Failing closed here means something specific and deliberate: a tampered
 * encumbrance row is *not* skipped as unreadable, because skipping it would
 * silently free the authority it constrains — turning a corrupted record into
 * exactly the persistent over-commitment this layer exists to prevent. The
 * whole capacity question fails instead.
 */
export function assertEncumbranceIntegrity(encumbrance: GovernedAuthorityEncumbrance): GovernedAuthorityEncumbrance {
  const { digest: _digest, ...rest } = encumbrance;
  if (computeEncumbranceDigest(rest) !== encumbrance.digest) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_ENCUMBRANCE_RECORD_CORRUPTED',
      `Governed authority encumbrance '${encumbrance.id}' does not match its stored digest; refusing to compute capacity from it.`,
      { encumbranceId: encumbrance.id },
    );
  }
  return encumbrance;
}

/**
 * Whether a replayed creation names the same constraint as the one already
 * recorded under its idempotency key.
 *
 * Every dimension that decides *which* authority is constrained is compared. A
 * key reused for a different holder, resource, right, quantity, action or
 * source mandate is a different constraint wearing the same name, and is
 * refused rather than reinterpreted — mirroring `reservationReplayMatches` and
 * `assertReplayMatches` for transitions.
 */
export function encumbranceReplayMatches(
  existing: GovernedAuthorityEncumbrance,
  candidate: {
    readonly holderRef: string;
    readonly resourceKind: string;
    readonly resourceId: string;
    readonly governedRight: string;
    readonly scope: GovernedRightsScope;
    readonly sourceAction: string;
    readonly sourceMandateRef: string;
    readonly sourceExecutionRef: string;
  },
): boolean {
  return (
    existing.holderRef === candidate.holderRef &&
    existing.resourceKind === candidate.resourceKind &&
    existing.resourceId === candidate.resourceId &&
    existing.governedRight === candidate.governedRight &&
    existing.sourceAction === candidate.sourceAction &&
    existing.sourceMandateRef === candidate.sourceMandateRef &&
    existing.sourceExecutionRef === candidate.sourceExecutionRef &&
    JSON.stringify(serializeGovernedRightsScope(existing.scope)) === JSON.stringify(serializeGovernedRightsScope(candidate.scope))
  );
}

/** An encumbrance's id, derived from the tenant, the execution that created it and the right it constrains, so both backends name the same record and a duplicate is impossible to construct. */
export function deriveEncumbranceId(tenantId: string, sourceExecutionRef: string, governedRight: string): string {
  return `governed-authority-encumbrance-${computeDigest({ tenantId, sourceExecutionRef, governedRight }).slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

/** The idempotency identity a creation defaults to: one constraint per execution per right. Supplied explicitly only when a caller has its own request-level identity. */
export function deriveEncumbranceIdempotencyKey(sourceExecutionRef: string, governedRight: string): string {
  return `${sourceExecutionRef}:${governedRight}`;
}
