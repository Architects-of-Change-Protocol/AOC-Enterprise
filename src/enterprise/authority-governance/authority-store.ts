import type {
  GovernedAuthorityAvailability,
  GovernedAuthorityEncumbrance,
  GovernedAuthorityPosition,
  GovernedAuthorityReservation,
  GovernedAuthorityTransition,
} from '@aoc-enterprise/governed-authority';
import type { GovernedRightType } from '@aoc-enterprise/governed-authorization';

import { AuthorityGovernanceError } from './errors.js';
import type {
  AcquireGovernedAuthorityReservationInput,
  AcquireGovernedAuthorityReservationOutcome,
  ApplyGovernedAuthorityTransitionInput,
  ApplyGovernedAuthorityTransitionOutcome,
  AuthorityGovernanceContext,
  BootstrapGovernedAuthorityInput,
  GovernedAuthorityProvenance,
  GovernedAuthorityResourceRef,
  GovernedAuthorityAvailabilityQuery,
  GovernedAuthorityStoreHealth,
  RecordGovernedAuthorityEncumbranceInput,
  RecordGovernedAuthorityEncumbranceOutcome,
  ReleaseGovernedAuthorityEncumbranceInput,
  ReleaseGovernedAuthorityReservationInput,
} from './contracts.js';

/**
 * The durable Governed Authority Store: the recognized right-scoped authority
 * positions of a deployment, and the append-only transition history that
 * produced them.
 *
 * An independent store, never persisted inside the Governance Store, the
 * TransferMandate Store or any other module's tables — the same "one store per
 * Enterprise entity" precedent `../governance-store/`,
 * `../access-governance/`, `../tokenization-governance/`,
 * `../collateralization-governance/`, `../license-governance/` and
 * `../transfer-governance/` already establish.
 *
 * Deliberately entity-specific rather than a generic ledger abstraction. There
 * are exactly two ways *authority* changes here — issue authority that did not
 * exist (privileged), and move authority that did (evidenced) — so there is no
 * generic `update`, no `setBalance`, no `delete`, and no path by which a
 * caller could write a position directly.
 *
 * ## Why reservations live here
 *
 * This store also holds `GovernedAuthorityReservation`s: how much of each
 * position is already committed to a still-live authorization. They are here,
 * rather than beside the mandates they belong to, for one reason that admits
 * no alternative — **availability is a function of positions and reservations
 * together, so the check and the write must share a transaction.** Split
 * across two stores, "read availability, then commit" would be two unprotected
 * steps and the double commitment would simply move one layer up. Here it is
 * one synchronous critical section in memory and one `db.transaction(...)` in
 * SQLite, and terminalizing a reservation commits atomically with the debit it
 * accompanies.
 *
 * That placement is deliberate about what it does *not* mix in. A reservation
 * records no mandate terms, no policy, no approvals and no evidence; it records
 * a quantity, whose authority it stands against, and which artifact it stands
 * for. Mandate lifecycle stays in the mandate stores, where it belongs.
 *
 * ## Why encumbrances live here too
 *
 * The same argument, one lifecycle stage later, plus one that admits even less
 * alternative. `GovernedAuthorityEncumbrance` is what a *completed* execution
 * leaves behind, and it reduces the same capacity a reservation does, so the
 * capacity question is a function of positions, reservations **and**
 * encumbrances together — three dimensions of one deployment's authority
 * accounting, which must be read and written under one consistency boundary or
 * the double commitment simply moves one layer up.
 *
 * Beyond that, the handoff itself demands it. Turning a pre-execution
 * commitment into a persistent constraint has to be **one** durable step:
 * terminalize the reservation and record the constraint together, or neither.
 * Split across two stores there would be a window in which the reservation had
 * ended and the constraint did not yet exist, and a competitor arriving in that
 * window would be told the authority is free — which is the exact
 * vulnerability the whole layer exists to close.
 *
 * What this store still does *not* know is which future actions an encumbrance
 * conflicts with. It records that a quantity of one holder's authority over one
 * right of one resource stands constrained; deciding that collateralizing
 * conflicts with collateralizing, or that it does not conflict with licensing,
 * is action semantics and stays out of here. The only rule this layer enforces
 * across actions is structural, not commercial: it will not leave a constraint
 * referring to authority a holder no longer possesses.
 *
 * Note what this interface deliberately does *not* offer, and why:
 *
 * - **No revocation.** Withdrawing an actor's underlying authority is a
 *   different governance event from revoking a mandate, needs its own
 *   authority basis, and has no existing counterpart in the Authority Graph to
 *   mirror. Adding a generic `revokePosition` here would be inventing a
 *   governance act rather than persisting one.
 * - **No reversal.** A reported reversal is an observation, and an observation
 *   must not silently rewrite authority.
 * - **No broad query surface.** `listPositionsForHolder` and `getProvenance`
 *   exist for enforcement and audit respectively; there is no "list everything
 *   this tenant holds" report, because nothing needs one yet.
 */
export interface GovernedAuthorityStore {
  readonly providerKind: 'memory' | 'sqlite';

  /**
   * Creates or increases authority from a privileged basis. Throws
   * `GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED` unless `context.system`, and
   * `GOVERNED_AUTHORITY_BASIS_INVALID` for a `governed-execution` basis, which
   * is a movement rather than an issuance.
   */
  bootstrapPosition(context: AuthorityGovernanceContext, input: BootstrapGovernedAuthorityInput): Promise<GovernedAuthorityPosition>;

  /**
   * Debits the source holder and credits the target holder by the same
   * quantity, for every named right, in one commit section.
   *
   * Idempotent on `basis.executionRef`: replaying an execution already applied
   * returns the original transitions with `replayed: true`, and performs no
   * second debit and no second credit. Throws
   * `GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE` rather than producing a negative
   * position, and `GOVERNED_AUTHORITY_TRANSITION_CONFLICT` when the same
   * execution reference is replayed against materially different terms.
   */
  applyTransition(
    context: AuthorityGovernanceContext,
    input: ApplyGovernedAuthorityTransitionInput,
  ): Promise<ApplyGovernedAuthorityTransitionOutcome>;

  /** Tenant-scoped lookup of the (at most one) position an actor holds in a right of a resource, or `null`. */
  getPosition(
    context: AuthorityGovernanceContext,
    tenantId: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
    governedRight: GovernedRightType,
  ): Promise<GovernedAuthorityPosition | null>;

  /**
   * Whether this tenant holds *any* governed authority state for a resource.
   *
   * This is the enrollment question, and it is the whole of the legacy
   * compatibility policy: a resource nothing has been recorded against is one
   * this deployment has not enrolled in right-scoped authority, and enforcing
   * a right-scoped check against it would deny every existing deployment's
   * every request. See `resolver.ts`.
   */
  isResourceEnrolled(context: AuthorityGovernanceContext, tenantId: string, resource: GovernedAuthorityResourceRef): Promise<boolean>;

  /** Tenant-scoped list of everything one actor holds over one resource, in a stable order. Used by audit and by the reference scenario, never by the enforcement path. */
  listPositionsForHolder(
    context: AuthorityGovernanceContext,
    tenantId: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
  ): Promise<readonly GovernedAuthorityPosition[]>;

  /** A position and the ordered transitions that produced it. Throws `GOVERNED_AUTHORITY_POSITION_NOT_FOUND` if there is no such position. */
  getProvenance(
    context: AuthorityGovernanceContext,
    tenantId: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
    governedRight: GovernedRightType,
  ): Promise<GovernedAuthorityProvenance>;

  /** Tenant-scoped, append-ordered transitions recorded under one execution reference. Empty when that execution has never been applied — which is what makes recovery after a crash between stores decidable. */
  listTransitionsByExecutionRef(
    context: AuthorityGovernanceContext,
    tenantId: string,
    executionRef: string,
  ): Promise<readonly GovernedAuthorityTransition[]>;

  // -------------------------------------------------------------------------
  // Reservation. The commitment side of the same authority.
  // -------------------------------------------------------------------------

  /**
   * Atomically checks that enough authority is still uncommitted and, if so,
   * records the commitment.
   *
   * **Check and write are one operation, and there is deliberately no
   * separately callable "check" that could be used to build them out of two.**
   * `resolveAvailability` exists for explanation and audit, and its answer is
   * explicitly a snapshot — a caller that read 5 000 bp available and then
   * asked for 4 000 can still lose here, and must, because another commitment
   * may have won the race in between. This method re-derives availability
   * inside its own transaction and refuses on the state it finds there.
   *
   * Throws `GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT` when standing
   * commitments leave too little — distinct from
   * `GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE`, which means the holder never held
   * enough at all. Throws `GOVERNED_AUTHORITY_RESERVATION_CONFLICT` when the
   * idempotency key is reused for a materially different commitment.
   *
   * Idempotent on the idempotency key: replaying an acquisition already made
   * returns the original reservation with `replayed: true` and commits no
   * second quantity.
   */
  acquireReservation(
    context: AuthorityGovernanceContext,
    input: AcquireGovernedAuthorityReservationInput,
  ): Promise<AcquireGovernedAuthorityReservationOutcome>;

  /**
   * Ends a still-active commitment without any authority having moved, so the
   * capacity becomes available again. The position is untouched: a release is
   * not a credit.
   *
   * Idempotent and non-accumulating. Releasing an already-released reservation
   * returns it unchanged rather than freeing capacity twice — which is safe by
   * construction anyway, because availability is derived from the reservations
   * that are still active rather than from a counter that could be decremented
   * twice. Releasing a `'consumed'` reservation is refused with
   * `GOVERNED_AUTHORITY_RESERVATION_CONFLICT`: the authority has already moved,
   * and treating that as returnable capacity would fabricate it.
   *
   * `reason: 'administrative'` requires `context.system`.
   */
  releaseReservation(context: AuthorityGovernanceContext, input: ReleaseGovernedAuthorityReservationInput): Promise<GovernedAuthorityReservation>;

  /**
   * What the holder possesses, what stands committed against it, and what can
   * still be committed now.
   *
   * For explanation, audit and denial evidence. **Never a gate**: an answer
   * from here is a snapshot of a moment that has already passed by the time a
   * caller acts on it, and only `acquireReservation` decides.
   */
  resolveAvailability(context: AuthorityGovernanceContext, query: GovernedAuthorityAvailabilityQuery): Promise<GovernedAuthorityAvailability>;

  /** Tenant-scoped lookup of one reservation, or `null`. */
  getReservation(context: AuthorityGovernanceContext, tenantId: string, reservationId: string): Promise<GovernedAuthorityReservation | null>;

  /**
   * Tenant-scoped, stably-ordered reservations recorded against one
   * authorization artifact — the audit link from a mandate to the capacity it
   * committed, and what makes "was this mandate ever supported by a
   * reservation?" decidable rather than assumed.
   */
  listReservationsByMandateRef(
    context: AuthorityGovernanceContext,
    tenantId: string,
    sourceMandateRef: string,
  ): Promise<readonly GovernedAuthorityReservation[]>;

  /** Every reservation still reducing availability for one holder, resource and right at an instant. Used by audit and by availability explanation; the enforcement path uses `acquireReservation`. */
  listActiveReservations(
    context: AuthorityGovernanceContext,
    query: GovernedAuthorityAvailabilityQuery,
  ): Promise<readonly GovernedAuthorityReservation[]>;

  // -------------------------------------------------------------------------
  // Encumbrance. The persistent side of the same authority.
  // -------------------------------------------------------------------------

  /**
   * Atomically records that a successfully executed governed action left this
   * authority persistently constrained, and hands the pre-execution commitment
   * over to it in the same commit section.
   *
   * **There is deliberately no way to create a constraint that is not rooted in
   * an execution.** The input has no free-text basis and no caller-chosen
   * status; what it has is a `sourceExecutionRef`, and the action it names must
   * be classified as encumbering
   * (`GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS`) or the call is refused with
   * `GOVERNED_AUTHORITY_ENCUMBRANCE_BASIS_INVALID`. A requester asserting "my
   * authority is encumbered" has no path here at all, in the same way that
   * "I hold 100%" has no path to `bootstrapPosition`.
   *
   * Capacity is re-derived inside this operation, from the position, the
   * standing commitments and the constraints already recorded — never from a
   * figure a caller measured earlier. The reservation being handed over is
   * netted out rather than counted against the constraint replacing it, so one
   * commitment is never counted twice at the moment it changes phase. Throws
   * `GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT` when what is left cannot
   * cover the constraint.
   *
   * Idempotent on the idempotency key, which defaults to the execution
   * reference and right: replaying an execution AOC has already encumbered
   * returns the original constraint with `replayed: true` and constrains no
   * second quantity. Throws `GOVERNED_AUTHORITY_ENCUMBRANCE_CONFLICT` when the
   * same execution identity comes back naming a different holder, resource,
   * right, quantity, action or mandate.
   */
  recordEncumbrance(
    context: AuthorityGovernanceContext,
    input: RecordGovernedAuthorityEncumbranceInput,
  ): Promise<RecordGovernedAuthorityEncumbranceOutcome>;

  /**
   * Ends a standing constraint, so the authority it constrained becomes
   * committable again. The position is untouched: a release is not a credit,
   * and a holder who kept 5 000 bp throughout still has exactly 5 000 bp
   * afterwards.
   *
   * Requires `context.system`. The only basis is `'administrative'`, and that
   * narrowness is deliberate rather than provisional: `COLLATERALIZE`'s
   * `recordRelease` is an unverified external *observation*, which the
   * collateralization module already refuses to let decrement its own
   * `committedScope`, and letting it free authority capacity here would hand
   * any tenant-scoped caller a way to manufacture headroom by reporting a
   * release. An authorized discharge is a governed action that does not exist
   * yet; until it does, releasing a constraint is an operator act.
   *
   * Idempotent and non-accumulating. Releasing an already-released constraint
   * returns it unchanged rather than freeing capacity twice — which is safe by
   * construction anyway, because capacity is derived from the constraints still
   * active rather than from a counter that could be decremented twice.
   */
  releaseEncumbrance(
    context: AuthorityGovernanceContext,
    input: ReleaseGovernedAuthorityEncumbranceInput,
  ): Promise<GovernedAuthorityEncumbrance>;

  /** Tenant-scoped lookup of one encumbrance, or `null`. A cross-tenant id reads as absent rather than as a refusal, so identifiers cannot be probed. */
  getEncumbrance(context: AuthorityGovernanceContext, tenantId: string, encumbranceId: string): Promise<GovernedAuthorityEncumbrance | null>;

  /** Tenant-scoped, stably-ordered constraints recorded against one authorization artifact — the audit link from a mandate to what its execution left behind. */
  listEncumbrancesByMandateRef(
    context: AuthorityGovernanceContext,
    tenantId: string,
    sourceMandateRef: string,
  ): Promise<readonly GovernedAuthorityEncumbrance[]>;

  /**
   * Every constraint still standing over one holder, resource and right at an
   * instant.
   *
   * This is the cross-mandate question `committedScope` cannot answer: a
   * mandate's own cumulative scope sees only its own executions, while this
   * sees every constraint over the same authority whichever mandate produced
   * it. Used by audit and by capacity explanation; the enforcement path uses
   * `acquireReservation` and `recordEncumbrance`, which re-derive it inside
   * their own transactions.
   */
  listActiveEncumbrances(
    context: AuthorityGovernanceContext,
    query: GovernedAuthorityAvailabilityQuery,
  ): Promise<readonly GovernedAuthorityEncumbrance[]>;

  health(): Promise<GovernedAuthorityStoreHealth>;

  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Tenancy guards — identical in intent and wording to
// `canAccessTransferOrganization` / `requireTransferAccessToOrganization`
// (`../transfer-governance/mandate-store.ts`), so one tenancy rule is learned
// once and applies everywhere.
// ---------------------------------------------------------------------------

export function canAccessAuthorityOrganization(context: AuthorityGovernanceContext, recordOrganizationId: string): boolean {
  if (context.system) return true;
  return context.organizationId !== undefined && context.organizationId === recordOrganizationId;
}

export function requireAuthorityTenantScope(context: AuthorityGovernanceContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_TENANT_SCOPE_REQUIRED',
      'A non-system caller must provide an organization scope for governed authority data.',
    );
  }
}

export function requireAuthorityAccessToOrganization(context: AuthorityGovernanceContext, organizationId: string): void {
  requireAuthorityTenantScope(context);
  if (!canAccessAuthorityOrganization(context, organizationId)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION',
      `The caller is not authorized to access governed authority data for organization '${organizationId}'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Strict UTC timestamps — the same rule the four action stores enforce: a
// trailing offset like `+02:00` is well-formed ISO 8601 and is NOT accepted,
// so every durably recorded instant here is unambiguously UTC on its face.
// ---------------------------------------------------------------------------

const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]00:00)$/;

export function isStrictUtcAuthorityTimestamp(value: unknown): value is string {
  return typeof value === 'string' && STRICT_UTC_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function requireStrictUtcAuthorityTimestamp(value: unknown, fieldName: string): string {
  if (!isStrictUtcAuthorityTimestamp(value)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_INVALID_TIMESTAMP',
      `${fieldName} must be a strict UTC ISO 8601 timestamp (e.g. '2026-08-06T12:00:00.000Z'); received '${String(value)}'.`,
    );
  }
  return value;
}
