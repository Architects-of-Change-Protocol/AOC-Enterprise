import {
  governedAuthorityPositionKey,
  governedAuthorityReservationReducesAvailability,
  type GovernedAuthorityPosition,
  type GovernedAuthorityReservation,
  type GovernedAuthorityTransition,
} from '@aoc-enterprise/governed-authority';
import { governedRightsScopeWithin, serializeGovernedRightsScope, type GovernedRightType } from '@aoc-enterprise/governed-authorization';

import { AuthorityGovernanceError } from './errors.js';
import {
  addAuthorityScopes,
  assertBasisMatchesMovement,
  assertDistinctHolders,
  assertKnownGovernedRight,
  assertNonZeroAuthorityScope,
  assertPositionIntegrity,
  assertTransitionChain,
  assertTransitionIntegrity,
  assertValidAuthorityScope,
  computePositionDigest,
  computeTransitionDigest,
  deriveAuthorityIssuanceTransitionId,
  deriveAuthorityMovementTransitionId,
  deriveAuthorityPositionId,
  subtractAuthorityScope,
} from './lifecycle.js';
import {
  assertReservationIntegrity,
  computeReservationDigest,
  computeAvailability,
  deriveReservationId,
  reservationReplayMatches,
} from './reservation-lifecycle.js';
import {
  requireAuthorityAccessToOrganization,
  requireStrictUtcAuthorityTimestamp,
  type GovernedAuthorityStore,
} from './authority-store.js';
import type {
  AcquireGovernedAuthorityReservationInput,
  ApplyGovernedAuthorityTransitionInput,
  ApplyGovernedAuthorityTransitionOutcome,
  AuthorityGovernanceContext,
  BootstrapGovernedAuthorityInput,
  GovernedAuthorityAvailabilityQuery,
  GovernedAuthorityProvenance,
  GovernedAuthorityResourceRef,
  GovernedAuthorityStoreHealth,
  ReleaseGovernedAuthorityReservationInput,
} from './contracts.js';

/**
 * Bumped whenever the durable shape changes. The SQLite store refuses to open a
 * database written under a different value — with exactly one exception, the
 * additive `v1 -> v2` migration that adds the reservations table — and this
 * constant is the single place both stores agree on it.
 */
export const GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION = 'aoc.governed-authority-store.schema.v2';

export interface CreateInMemoryGovernedAuthorityStoreOptions {
  readonly now?: () => string;
}

function resourceKey(tenantId: string, resource: GovernedAuthorityResourceRef): string {
  return `${tenantId.length}:${tenantId}|${resource.kind.length}:${resource.kind}|${resource.id.length}:${resource.id}`;
}

/**
 * In-memory `GovernedAuthorityStore`. The reference implementation of the
 * behavioural contract `sqlite-authority-store.ts` must match exactly —
 * identical conservation, identical refusals, identical error codes, identical
 * digests — so a suite written once runs against both and a passing test
 * double actually proves something about the durable store.
 *
 * Not a cache and never a fallback for a failed durable store: a deployment
 * that wants authority state to survive a restart configures the SQLite store,
 * and one that silently degraded to this one would lose authority movements
 * without saying so.
 *
 * Every mutating method below is written as a *single synchronous critical
 * section* — every check and every write happen with no `await` between them.
 * The Node event loop cannot interleave another caller into such a section, so
 * two concurrent transfers against the same position serialize, and the
 * lost-update that would let 10 000 bp fund two 6 000 bp movements cannot
 * occur. This mirrors what better-sqlite3's synchronous transactions give the
 * durable store, deliberately, so the concurrency suite means the same thing
 * against both.
 */
export function createInMemoryGovernedAuthorityStore(options: CreateInMemoryGovernedAuthorityStoreOptions = {}): GovernedAuthorityStore {
  const now = options.now ?? (() => new Date().toISOString());

  const positions = new Map<string, GovernedAuthorityPosition>();
  const transitions: GovernedAuthorityTransition[] = [];
  const reservations = new Map<string, GovernedAuthorityReservation>();
  const sequenceByTenant = new Map<string, number>();
  const lastDigestByTenant = new Map<string, string>();
  const issuanceOrdinalByTenant = new Map<string, number>();

  /** The ordinal an issuance transition's derived id uses. Mirrors the chain position the SQLite store derives its own from, so both backends produce the same shape of id. */
  function nextIssuanceOrdinal(tenantId: string): number {
    const next = (issuanceOrdinalByTenant.get(tenantId) ?? 0) + 1;
    issuanceOrdinalByTenant.set(tenantId, next);
    return next;
  }

  function nextSequence(tenantId: string): number {
    const next = (sequenceByTenant.get(tenantId) ?? 0) + 1;
    sequenceByTenant.set(tenantId, next);
    return next;
  }

  /** Seals a transition: assigns its chain position, links it to the tenant's previous transition, digests it, and appends. The only way a transition is ever created. */
  function appendTransition(draft: Omit<GovernedAuthorityTransition, 'sequence' | 'previousDigest' | 'digest'>): GovernedAuthorityTransition {
    const previousDigest = lastDigestByTenant.get(draft.tenantId);
    const unsealed = {
      ...draft,
      sequence: nextSequence(draft.tenantId),
      ...(previousDigest !== undefined ? { previousDigest } : {}),
    };
    const sealed: GovernedAuthorityTransition = { ...unsealed, digest: computeTransitionDigest(unsealed) };
    lastDigestByTenant.set(draft.tenantId, sealed.digest);
    transitions.push(sealed);
    return sealed;
  }

  /** Seals a position and stores it under its canonical key. Digest is recomputed from the final field values, never carried over from a previous version of the row. */
  function putPosition(draft: Omit<GovernedAuthorityPosition, 'digest'>): GovernedAuthorityPosition {
    const sealed: GovernedAuthorityPosition = { ...draft, digest: computePositionDigest(draft) };
    positions.set(
      governedAuthorityPositionKey({
        tenantId: sealed.tenantId,
        actorRef: sealed.actorRef,
        resourceKind: sealed.resourceKind,
        resourceId: sealed.resourceId,
        governedRight: sealed.governedRight,
      }),
      sealed,
    );
    return sealed;
  }

  function readPosition(
    tenantId: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
    governedRight: GovernedRightType,
  ): GovernedAuthorityPosition | null {
    const found = positions.get(governedAuthorityPositionKey({ tenantId, actorRef: holderRef, resourceKind: resource.kind, resourceId: resource.id, governedRight }));
    return found === undefined ? null : assertPositionIntegrity(found);
  }

  function putReservation(draft: Omit<GovernedAuthorityReservation, 'digest'>): GovernedAuthorityReservation {
    const sealed: GovernedAuthorityReservation = { ...draft, digest: computeReservationDigest(draft) };
    reservations.set(sealed.id, sealed);
    return sealed;
  }

  /**
   * Every reservation standing against one holder's authority over one right of
   * one resource, verified on read.
   *
   * Integrity is asserted here rather than filtered: a tampered row must fail
   * the whole availability question, never quietly drop out of the sum and free
   * the capacity it commits.
   */
  function isEnrolled(tenantId: string, resource: GovernedAuthorityResourceRef): boolean {
    const key = resourceKey(tenantId, resource);
    for (const position of positions.values()) {
      if (resourceKey(position.tenantId, { kind: position.resourceKind, id: position.resourceId }) === key) return true;
    }
    return false;
  }

  function readReservationsFor(tenantId: string, holderRef: string, resource: GovernedAuthorityResourceRef, governedRight: GovernedRightType): GovernedAuthorityReservation[] {
    return [...reservations.values()]
      .filter(
        (reservation) =>
          reservation.tenantId === tenantId &&
          reservation.holderRef === holderRef &&
          reservation.resourceKind === resource.kind &&
          reservation.resourceId === resource.id &&
          reservation.governedRight === governedRight,
      )
      .map(assertReservationIntegrity)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  return {
    providerKind: 'memory',

    async bootstrapPosition(context, input) {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      if (!context.system) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED',
          'Creating governed authority requires a privileged administrative context; an actor can never obtain a position by asserting one.',
          { tenantId: input.tenantId, holderRef: input.holderRef },
        );
      }
      assertKnownGovernedRight(input.governedRight);
      assertValidAuthorityScope(input.scope, 'scope');
      assertNonZeroAuthorityScope(input.scope, 'scope');
      assertBasisMatchesMovement(input.basis, undefined);
      const effectiveFrom = requireStrictUtcAuthorityTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = input.expiresAt === undefined ? undefined : requireStrictUtcAuthorityTimestamp(input.expiresAt, 'expiresAt');
      const occurredAt = requireStrictUtcAuthorityTimestamp(input.occurredAt ?? input.effectiveFrom, 'occurredAt');
      const recordedAt = requireStrictUtcAuthorityTimestamp(now(), 'recordedAt');

      const existing = readPosition(input.tenantId, input.holderRef, input.resource, input.governedRight);

      const transition = appendTransition({
        id: input.transitionId ?? deriveAuthorityIssuanceTransitionId(input.tenantId, nextIssuanceOrdinal(input.tenantId)),
        tenantId: input.tenantId,
        resourceKind: input.resource.kind,
        resourceId: input.resource.id,
        governedRight: input.governedRight,
        scope: serializeGovernedRightsScope(input.scope),
        toActorRef: input.holderRef,
        basis: input.basis,
        occurredAt,
        recordedAt,
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      });

      if (existing === null) {
        return putPosition({
          id:
            input.positionId ??
            deriveAuthorityPositionId({
              tenantId: input.tenantId,
              actorRef: input.holderRef,
              resourceKind: input.resource.kind,
              resourceId: input.resource.id,
              governedRight: input.governedRight,
            }),
          tenantId: input.tenantId,
          actorRef: input.holderRef,
          resourceKind: input.resource.kind,
          resourceId: input.resource.id,
          governedRight: input.governedRight,
          scope: serializeGovernedRightsScope(input.scope),
          effectiveFrom,
          ...(expiresAt !== undefined ? { expiresAt } : {}),
          createdAt: recordedAt,
          updatedAt: recordedAt,
          lastTransitionRef: transition.id,
        });
      }

      // Bootstrapping onto an existing position adds to it, using the same
      // canonical sum a transfer credit uses. Its window is not silently
      // rewritten: an issuance that would change when existing authority
      // starts or ends is a different act from adding to it.
      return putPosition({
        ...existing,
        scope: addAuthorityScopes(existing.scope, input.scope, { positionId: existing.id }),
        updatedAt: recordedAt,
        lastTransitionRef: transition.id,
      });
    },

    async applyTransition(context, input) {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      assertBasisMatchesMovement(input.basis, input.fromHolderRef);
      assertDistinctHolders(input.fromHolderRef, input.toHolderRef);
      assertValidAuthorityScope(input.scope, 'scope');
      assertNonZeroAuthorityScope(input.scope, 'scope');
      for (const right of input.governedRights) assertKnownGovernedRight(right);
      if (input.governedRights.length === 0) {
        throw new AuthorityGovernanceError('GOVERNED_AUTHORITY_BASIS_INVALID', 'A governed authority transition must name at least one governed right.');
      }
      const occurredAt = requireStrictUtcAuthorityTimestamp(input.occurredAt, 'occurredAt');
      const recordedAt = requireStrictUtcAuthorityTimestamp(now(), 'recordedAt');

      // Replay check first, and before any position is read: an execution AOC
      // has already applied must produce no second debit and no second credit,
      // whatever the current balances happen to be.
      const alreadyApplied = transitions.filter(
        (entry) =>
          entry.tenantId === input.tenantId && entry.basis.kind === 'governed-execution' && entry.basis.executionRef === input.basis.executionRef,
      );
      if (alreadyApplied.length > 0) {
        assertReplayMatches(alreadyApplied, input);
        return { transitions: alreadyApplied.map(assertTransitionIntegrity), replayed: true };
      }

      // Every right is validated against the current balances before the first
      // one is written, so a two-right execution whose second right is
      // uncovered moves neither. This is the whole-or-nothing property the
      // SQLite store gets from its transaction, held here by never awaiting.
      const staged = input.governedRights.map((governedRight) => {
        const source = readPosition(input.tenantId, input.fromHolderRef, input.resource, governedRight);
        if (source === null) {
          throw new AuthorityGovernanceError(
            'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
            `'${input.fromHolderRef}' holds no recognized authority over '${governedRight}' of this resource; there is nothing to move.`,
            { tenantId: input.tenantId, holderRef: input.fromHolderRef, governedRight },
          );
        }
        const target = readPosition(input.tenantId, input.toHolderRef, input.resource, governedRight);
        return {
          governedRight,
          source,
          target,
          debited: subtractAuthorityScope(source.scope, input.scope, { positionId: source.id, governedRight }),
          credited: target === null ? serializeGovernedRightsScope(input.scope) : addAuthorityScopes(target.scope, input.scope, { positionId: target.id, governedRight }),
        };
      });

      const applied: GovernedAuthorityTransition[] = [];
      for (const entry of staged) {
        const transition = appendTransition({
          id: deriveAuthorityMovementTransitionId(
            input.transitionIdPrefix ?? 'governed-authority-transition',
            input.tenantId,
            input.basis.executionRef,
            entry.governedRight,
          ),
          tenantId: input.tenantId,
          resourceKind: input.resource.kind,
          resourceId: input.resource.id,
          governedRight: entry.governedRight,
          scope: serializeGovernedRightsScope(input.scope),
          fromActorRef: input.fromHolderRef,
          toActorRef: input.toHolderRef,
          basis: input.basis,
          occurredAt,
          recordedAt,
          ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        });

        putPosition({ ...entry.source, scope: entry.debited, updatedAt: recordedAt, lastTransitionRef: transition.id });

        if (entry.target === null) {
          putPosition({
            id: deriveAuthorityPositionId({
              tenantId: input.tenantId,
              actorRef: input.toHolderRef,
              resourceKind: input.resource.kind,
              resourceId: input.resource.id,
              governedRight: entry.governedRight,
            }),
            tenantId: input.tenantId,
            actorRef: input.toHolderRef,
            resourceKind: input.resource.kind,
            resourceId: input.resource.id,
            governedRight: entry.governedRight,
            scope: entry.credited,
            // A credited position becomes effective when the movement did, not
            // when the source's authority began: the recipient held nothing
            // before this transition.
            effectiveFrom: occurredAt,
            createdAt: recordedAt,
            updatedAt: recordedAt,
            lastTransitionRef: transition.id,
          });
        } else {
          putPosition({ ...entry.target, scope: entry.credited, updatedAt: recordedAt, lastTransitionRef: transition.id });
        }

        applied.push(transition);
      }

      // The reservation this movement was authorized against, terminalized in
      // the same critical section that just debited the position.
      //
      // Ordering matters and this is the safe one: the debit has happened, so
      // the capacity is genuinely spent, and marking the reservation
      // `'consumed'` stops it being subtracted a second time from a position
      // that already reflects the movement. Crashing before this line leaves
      // the reservation active over an already-debited position — visible,
      // conservative (it under-reports availability rather than over-reporting
      // it), and self-clearing at `expiresAt`. There is no window in which
      // capacity is freed for a movement that did not happen.
      if (input.consumesReservationsForMandateRef !== undefined) {
        for (const reservation of reservations.values()) {
          if (reservation.tenantId !== input.tenantId) continue;
          if (reservation.sourceMandateRef !== input.consumesReservationsForMandateRef) continue;
          if (reservation.status !== 'active') continue;
          putReservation({ ...assertReservationIntegrity(reservation), status: 'consumed', updatedAt: recordedAt });
        }
      }

      return { transitions: applied, replayed: false };
    },

    async getPosition(context, tenantId, holderRef, resource, governedRight) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return readPosition(tenantId, holderRef, resource, governedRight);
    },

    async isResourceEnrolled(context, tenantId, resource) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return isEnrolled(tenantId, resource);
    },

    async listPositionsForHolder(context, tenantId, holderRef, resource) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return [...positions.values()]
        .filter(
          (position) =>
            position.tenantId === tenantId && position.actorRef === holderRef && position.resourceKind === resource.kind && position.resourceId === resource.id,
        )
        .map(assertPositionIntegrity)
        .sort((a, b) => (a.governedRight < b.governedRight ? -1 : a.governedRight > b.governedRight ? 1 : 0));
    },

    async getProvenance(context, tenantId, holderRef, resource, governedRight) {
      requireAuthorityAccessToOrganization(context, tenantId);
      const position = readPosition(tenantId, holderRef, resource, governedRight);
      if (position === null) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_POSITION_NOT_FOUND',
          `'${holderRef}' holds no recognized authority over '${governedRight}' of '${resource.kind}:${resource.id}'.`,
          { tenantId, holderRef, governedRight },
        );
      }
      const touching = transitions.filter(
        (transition) =>
          transition.tenantId === tenantId &&
          transition.resourceKind === resource.kind &&
          transition.resourceId === resource.id &&
          transition.governedRight === governedRight &&
          (transition.toActorRef === holderRef || transition.fromActorRef === holderRef),
      );
      return { position, transitions: touching.map(assertTransitionIntegrity) };
    },

    async listTransitionsByExecutionRef(context, tenantId, executionRef) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return transitions
        .filter((transition) => transition.tenantId === tenantId && transition.basis.kind === 'governed-execution' && transition.basis.executionRef === executionRef)
        .map(assertTransitionIntegrity);
    },

    // -----------------------------------------------------------------------
    // Reservation. Every method below is one synchronous critical section — no
    // `await` between the read and the write — so `acquireReservation` cannot
    // be interleaved by another caller between deciding availability and
    // recording the commitment. That is the same guarantee better-sqlite3's
    // synchronous `db.transaction(...)` gives the durable store, held here by
    // construction so the shared contract suite means the same thing against
    // both.
    // -----------------------------------------------------------------------

    async acquireReservation(context, input) {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      assertKnownGovernedRight(input.governedRight);
      assertValidAuthorityScope(input.scope, 'scope');
      assertNonZeroAuthorityScope(input.scope, 'scope');
      const effectiveFrom = requireStrictUtcAuthorityTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcAuthorityTimestamp(input.expiresAt, 'expiresAt');
      if (Date.parse(expiresAt) <= Date.parse(effectiveFrom)) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_SCOPE_INVALID',
          'A governed authority reservation must expire after it becomes effective; a commitment that never stands reduces nothing.',
          { effectiveFrom, expiresAt },
        );
      }
      const recordedAt = requireStrictUtcAuthorityTimestamp(now(), 'recordedAt');
      const idempotencyKey = input.idempotencyKey ?? input.sourceMandateRef;

      // Replay first, and before availability is read: an acquisition AOC has
      // already made must not commit a second quantity, whatever the current
      // availability happens to be.
      const existing = [...reservations.values()].find(
        (reservation) => reservation.tenantId === input.tenantId && reservation.idempotencyKey === idempotencyKey,
      );
      if (existing !== undefined) {
        const verified = assertReservationIntegrity(existing);
        if (
          !reservationReplayMatches(verified, {
            holderRef: input.holderRef,
            resourceKind: input.resource.kind,
            resourceId: input.resource.id,
            governedRight: input.governedRight,
            scope: input.scope,
            action: input.action,
            sourceMandateRef: input.sourceMandateRef,
          })
        ) {
          throw new AuthorityGovernanceError(
            'GOVERNED_AUTHORITY_RESERVATION_CONFLICT',
            `Idempotency key '${idempotencyKey}' already commits governed authority under materially different terms; a replay must restate the same commitment.`,
            { idempotencyKey, reservationId: verified.id },
          );
        }
        return { outcome: 'reserved', reservation: verified, replayed: true };
      }

      // A commitment is identified by the artifact it stands for, so a second
      // acquisition naming the same mandate and right is the same commitment
      // however it was keyed. Refused explicitly rather than left to collide on
      // the derived id — in memory that collision would silently overwrite a
      // live commitment, and in SQLite it would surface as a raw driver error
      // instead of this module's taxonomy.
      const forSameMandate = [...reservations.values()].find(
        (reservation) =>
          reservation.tenantId === input.tenantId &&
          reservation.sourceMandateRef === input.sourceMandateRef &&
          reservation.governedRight === input.governedRight,
      );
      if (forSameMandate !== undefined) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_RESERVATION_CONFLICT',
          `Mandate '${input.sourceMandateRef}' already commits governed authority over '${input.governedRight}' under a different idempotency key.`,
          { sourceMandateRef: input.sourceMandateRef, governedRight: input.governedRight, reservationId: forSameMandate.id },
        );
      }

      // Availability is derived here, inside the critical section, from the
      // position and the commitments as they are *now* — never from a figure a
      // caller measured before calling. This is the whole of the conservation
      // gate.
      const position = readPosition(input.tenantId, input.holderRef, input.resource, input.governedRight);
      const standing = readReservationsFor(input.tenantId, input.holderRef, input.resource, input.governedRight);
      const availability = computeAvailability(position, standing, recordedAt);

      if (availability.outcome === 'no_authority') {
        // Enrolment is consulted only once the holder turns out to have no
        // position, so the common enforced path costs no extra read — the same
        // ordering `resolver.ts` uses for coverage. A resource with positions
        // but none for this holder-and-right is enrolled, and fails closed.
        if (!isEnrolled(input.tenantId, input.resource)) return { outcome: 'resource_not_enrolled' };
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
          `'${input.holderRef}' holds no recognized authority over '${input.governedRight}' of this resource; there is nothing to commit.`,
          { tenantId: input.tenantId, holderRef: input.holderRef, governedRight: input.governedRight },
        );
      }
      if (availability.outcome === 'incompatible') {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
          'This governed authority cannot be committed by that quantity: the position and the standing commitments are not commensurable with it.',
          { tenantId: input.tenantId, holderRef: input.holderRef, governedRight: input.governedRight },
        );
      }
      if (availability.outcome === 'overcommitted') {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
          `More governed authority already stands committed against '${input.holderRef}' than that holder possesses; refusing to commit further until the inconsistency is resolved.`,
          {
            tenantId: input.tenantId,
            holderRef: input.holderRef,
            governedRight: input.governedRight,
            held: availability.held,
            committed: availability.committed,
          },
        );
      }

      if (!governedRightsScopeWithin(serializeGovernedRightsScope(input.scope), availability.available)) {
        // Deliberately not `GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE`. The holder
        // may possess ample authority; what is exhausted is the portion not
        // already promised elsewhere, and an operator's remedy for that is to
        // wait or to release, never to acquire more of the right.
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
          `'${input.holderRef}' holds enough '${input.governedRight}' in total, but too much of it is already committed to still-live governed authorizations to commit this much more.`,
          {
            tenantId: input.tenantId,
            holderRef: input.holderRef,
            governedRight: input.governedRight,
            held: availability.held,
            ...(availability.committed !== undefined ? { committed: availability.committed } : {}),
            available: availability.available,
            requested: serializeGovernedRightsScope(input.scope),
          },
        );
      }

      const reservation = putReservation({
        id: deriveReservationId(input.tenantId, input.sourceMandateRef, input.governedRight),
        tenantId: input.tenantId,
        holderRef: input.holderRef,
        resourceKind: input.resource.kind,
        resourceId: input.resource.id,
        governedRight: input.governedRight,
        scope: serializeGovernedRightsScope(input.scope),
        action: input.action,
        sourceRequestRef: input.sourceRequestRef,
        ...(input.sourceDecisionRef !== undefined ? { sourceDecisionRef: input.sourceDecisionRef } : {}),
        sourceMandateRef: input.sourceMandateRef,
        effectiveFrom,
        expiresAt,
        status: 'active',
        idempotencyKey,
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        createdAt: recordedAt,
        updatedAt: recordedAt,
      });
      return { outcome: 'reserved', reservation, replayed: false };
    },

    async releaseReservation(context, input) {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      if (input.reason === 'administrative' && !context.system) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED',
          'Administratively cancelling a governed authority reservation requires a privileged system context.',
          { reservationId: input.reservationId },
        );
      }
      const found = reservations.get(input.reservationId);
      if (found === undefined || found.tenantId !== input.tenantId) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_RESERVATION_NOT_FOUND',
          `No governed authority reservation '${input.reservationId}' exists in this tenant.`,
          { tenantId: input.tenantId, reservationId: input.reservationId },
        );
      }
      const verified = assertReservationIntegrity(found);
      // Already released: return it unchanged. Availability is derived from the
      // reservations still active rather than from a counter, so a second
      // release cannot free capacity twice even if one somehow occurred — but
      // returning the record rather than rewriting it keeps the audit honest
      // about when the release actually happened.
      if (verified.status === 'released') return verified;
      if (verified.status === 'consumed') {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_RESERVATION_CONFLICT',
          `Governed authority reservation '${verified.id}' was consumed by a completed movement; the authority has already moved and releasing it would fabricate capacity.`,
          { reservationId: verified.id },
        );
      }
      const releasedAt = requireStrictUtcAuthorityTimestamp(input.releasedAt ?? now(), 'releasedAt');
      return putReservation({ ...verified, status: 'released', updatedAt: releasedAt });
    },

    async resolveAvailability(context, query) {
      requireAuthorityAccessToOrganization(context, query.tenantId);
      const at = requireStrictUtcAuthorityTimestamp(query.at, 'at');
      const position = readPosition(query.tenantId, query.holderRef, query.resource, query.governedRight);
      return computeAvailability(position, readReservationsFor(query.tenantId, query.holderRef, query.resource, query.governedRight), at);
    },

    async getReservation(context, tenantId, reservationId) {
      requireAuthorityAccessToOrganization(context, tenantId);
      const found = reservations.get(reservationId);
      // A cross-tenant id reads as absent rather than as a refusal: a caller
      // must not be able to probe another tenant's reservation identifiers by
      // telling "denied" apart from "no such thing".
      if (found === undefined || found.tenantId !== tenantId) return null;
      return assertReservationIntegrity(found);
    },

    async listReservationsByMandateRef(context, tenantId, sourceMandateRef) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return [...reservations.values()]
        .filter((reservation) => reservation.tenantId === tenantId && reservation.sourceMandateRef === sourceMandateRef)
        .map(assertReservationIntegrity)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },

    async listActiveReservations(context, query) {
      requireAuthorityAccessToOrganization(context, query.tenantId);
      const at = requireStrictUtcAuthorityTimestamp(query.at, 'at');
      return readReservationsFor(query.tenantId, query.holderRef, query.resource, query.governedRight).filter((reservation) =>
        governedAuthorityReservationReducesAvailability(reservation, at),
      );
    },

    async health() {
      return {
        providerKind: 'memory',
        available: true,
        schemaVersion: GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION,
        positionCount: positions.size,
        transitionCount: transitions.length,
        activeReservationCount: [...reservations.values()].filter((reservation) => reservation.status === 'active').length,
      };
    },

    async close() {
      positions.clear();
      transitions.length = 0;
      reservations.clear();
      sequenceByTenant.clear();
      lastDigestByTenant.clear();
      issuanceOrdinalByTenant.clear();
    },
  };
}

/**
 * A replay must be a replay of the *same* movement. An execution reference
 * that comes back naming a different source, target, quantity or set of rights
 * is not an idempotent retry — it is either a caller bug or an attempt to
 * launder a second movement through a reference AOC has already accepted, and
 * returning the original transitions for it would silently authorize the
 * difference.
 */
export function assertReplayMatches(applied: readonly GovernedAuthorityTransition[], input: ApplyGovernedAuthorityTransitionInput): void {
  const conflict = (reason: string): never => {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_TRANSITION_CONFLICT',
      `Execution '${input.basis.executionRef}' was already applied to governed authority under different terms (${reason}); a replay must restate the same movement.`,
      { executionRef: input.basis.executionRef },
    );
  };
  const rights = new Set(applied.map((transition) => transition.governedRight));
  if (rights.size !== input.governedRights.length || !input.governedRights.every((right) => rights.has(right))) conflict('different governed rights');
  for (const transition of applied) {
    if (transition.fromActorRef !== input.fromHolderRef) conflict('different source holder');
    if (transition.toActorRef !== input.toHolderRef) conflict('different target holder');
    if (transition.resourceKind !== input.resource.kind || transition.resourceId !== input.resource.id) conflict('different resource');
    const stored = serializeGovernedRightsScope(transition.scope);
    const requested = serializeGovernedRightsScope(input.scope);
    if (JSON.stringify(stored) !== JSON.stringify(requested)) conflict('different scope');
  }
}

/** Re-exported so a caller that already imports the store can verify a chain it read, without reaching into `lifecycle.ts`. */
export { assertTransitionChain };
