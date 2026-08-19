import type {
  GovernedAuthorityBasis,
  GovernedAuthorityEncumbrance,
  GovernedAuthorityEncumbranceReleaseBasis,
  GovernedAuthorityPosition,
  GovernedAuthorityReservation,
  GovernedAuthorityTransition,
} from '@aoc-enterprise/governed-authority';
import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

/**
 * Tenant scope for every Governed Authority Store call. Identical in shape to
 * `TransferGovernanceContext`, `LicenseGovernanceContext` and
 * `GovernanceStoreAccessContext`, on purpose: a caller that already holds one
 * of those holds this one, and the tenancy rule a reviewer has already learned
 * once applies here unchanged.
 *
 * `system: true` is the privileged administrative context. It is the only
 * context that may create authority (`bootstrapPosition`), and it is never
 * reachable from a governed action, a request handler or an HTTP route.
 */
export interface AuthorityGovernanceContext {
  readonly system: boolean;
  readonly organizationId?: string;
  readonly actorId?: string;
}

/** A governed resource, flattened to the same `kind`/`id` pair every action module already persists as `assetKind`/`assetId`. */
export interface GovernedAuthorityResourceRef {
  readonly kind: string;
  readonly id: string;
}

/**
 * Creating initial authority. The privileged path, and the only issuance in
 * the model: it credits a position without debiting one, so it is what makes a
 * deployment's opening balances exist and what a migration uses.
 *
 * Requires `context.system`. This is deliberately not a user-facing surface,
 * and deliberately not something a party can call about itself — "I hold 100%"
 * must never be a request that grants authority. See `../../..` documentation
 * `docs/enterprise/AOC_GOVERNED_AUTHORITY.md`, "No self-issued authority".
 */
export interface BootstrapGovernedAuthorityInput {
  readonly transitionId?: string;
  readonly positionId?: string;
  readonly tenantId: string;
  readonly holderRef: string;
  readonly resource: GovernedAuthorityResourceRef;
  readonly governedRight: GovernedRightType;
  readonly scope: GovernedRightsScope;
  /** Must be `administrative-bootstrap` or `recognized-external-evidence`; a `governed-execution` basis is rejected, because a movement is not an issuance. */
  readonly basis: GovernedAuthorityBasis;
  readonly effectiveFrom: string;
  readonly expiresAt?: string;
  readonly occurredAt?: string;
  readonly correlationId?: string;
}

/**
 * Moving authority that already exists, on the strength of accepted evidence
 * that a governed external effect happened.
 *
 * One call, one commit section, however many rights it names: an execution
 * that moved the economic interest and the ownership interest together either
 * moves both or moves neither. The scope applies to each named right
 * independently — that is what the action terms mean by
 * `rights: [...]` alongside a single `scope`.
 *
 * `basis.executionRef` is the idempotency key. Replaying an execution Soberanía has
 * already applied returns the original transitions and performs no second
 * debit and no second credit.
 */
export interface ApplyGovernedAuthorityTransitionInput {
  readonly transitionIdPrefix?: string;
  readonly tenantId: string;
  readonly resource: GovernedAuthorityResourceRef;
  readonly governedRights: readonly GovernedRightType[];
  readonly scope: GovernedRightsScope;
  readonly fromHolderRef: string;
  readonly toHolderRef: string;
  readonly basis: Extract<GovernedAuthorityBasis, { kind: 'governed-execution' }>;
  readonly occurredAt: string;
  readonly correlationId?: string;
  /**
   * The mandate whose reservation this movement consumes.
   *
   * Present, every active reservation recorded against that mandate is moved
   * to `'consumed'` **inside the same commit section as the debit and the
   * credit**. That coupling is the whole point of putting reservations in this
   * store: releasing capacity and debiting the position are one durable step,
   * so neither of the two bad crash windows exists — capacity is never freed
   * for a movement that did not happen, and a completed movement never strands
   * its reservation active forever.
   *
   * Absent, no reservation is touched. That is the correct behaviour for a
   * deployment that has not adopted reservation and for an execution under a
   * mandate that never needed one.
   *
   * It rides on the existing `executionRef` idempotency: a replayed execution
   * returns early with `replayed: true`, so the reservation is consumed exactly
   * once no matter how the execution is retried.
   */
  readonly consumesReservationsForMandateRef?: string;
}

/** What an apply produced, and whether it produced it now or had already produced it. `replayed` is the signal a caller uses to distinguish "moved" from "already moved" without comparing balances. */
export interface ApplyGovernedAuthorityTransitionOutcome {
  readonly transitions: readonly GovernedAuthorityTransition[];
  readonly replayed: boolean;
}

/** A position plus the ordered transitions that produced it — the answer to "why does this actor have this authority?" without a second audit log. */
export interface GovernedAuthorityProvenance {
  readonly position: GovernedAuthorityPosition;
  readonly transitions: readonly GovernedAuthorityTransition[];
}

export interface GovernedAuthorityStoreHealth {
  readonly providerKind: 'memory' | 'sqlite';
  readonly available: boolean;
  readonly schemaVersion: string;
  readonly positionCount: number;
  readonly transitionCount: number;
  /** How many reservations currently carry `status: 'active'`. Counts stored status only: an active-but-lapsed row is still stored active, and is excluded from availability by the clock rather than by a rewrite. */
  readonly activeReservationCount: number;
  /** How many encumbrances currently carry `status: 'active'`. Unlike reservations there is no clock qualification to make: an encumbrance has no expiry, so a stored active row is an active constraint. */
  readonly activeEncumbranceCount: number;
}

// ---------------------------------------------------------------------------
// Governed authority reservation.
// ---------------------------------------------------------------------------

/**
 * Committing a finite quantity of a holder's authority to one authorization
 * artifact, so a competing authorization cannot promise the same capacity.
 *
 * Note what a caller does **not** supply: a status, a digest, or an
 * `available` figure it measured earlier. Status and digest are the store's;
 * availability is recomputed inside the acquiring transaction, because an
 * availability a caller observed before it called is a snapshot, not a
 * guarantee — and acting on the snapshot is precisely the time-of-check /
 * time-of-use race this operation exists to close.
 */
export interface AcquireGovernedAuthorityReservationInput {
  readonly tenantId: string;
  /** Whose authority is committed. Never the requester's or the representative's, unless they happen to be the holder. */
  readonly holderRef: string;
  readonly resource: GovernedAuthorityResourceRef;
  readonly governedRight: GovernedRightType;
  readonly scope: GovernedRightsScope;
  /** The governed action being authorized, in the same capability vocabulary a `governed-execution` basis uses. */
  readonly action: string;
  readonly sourceRequestRef: string;
  readonly sourceDecisionRef?: string;
  /** The authorization artifact this capacity is committed to. Supplied rather than derived because the artifact's identity must be fixed *before* the commitment is made — a reservation acquired for an artifact that does not yet have a name could not be released if issuing it then failed. */
  readonly sourceMandateRef: string;
  readonly effectiveFrom: string;
  /** Required. Set from the mandate's own expiry, so a commitment never outlives the authorization justifying it. */
  readonly expiresAt: string;
  /** Defaults to `sourceMandateRef`, which is already one-per-authorization. Supplied explicitly when a caller has its own request-level idempotency identity. */
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
}

/**
 * What an acquisition produced.
 *
 * Two outcomes rather than one, for the same reason `GovernedAuthorityCoverage`
 * carries `resource_not_enrolled`: a resource this deployment holds no
 * governed authority state for has no capacity for anything to commit, so
 * there is no double commitment to prevent and nothing to record. Refusing
 * such a request would deny every unenrolled resource in every existing
 * deployment on the day this shipped, and silently reserving against a
 * position that does not exist would be worse.
 *
 * The boundary is per-resource and one-way, exactly as enrolment already is:
 * the moment a resource has any position at all, every conserving
 * authorization over it must acquire a commitment, including for rights nobody
 * was bootstrapped into — those fail closed.
 */
export type AcquireGovernedAuthorityReservationOutcome =
  /** Capacity was committed. `replayed` distinguishes "committed now" from "already committed" without comparing availability. */
  | { readonly outcome: 'reserved'; readonly reservation: GovernedAuthorityReservation; readonly replayed: boolean }
  /** The resource is not enrolled in right-scoped authority. Nothing was committed, and nothing needed to be. */
  | { readonly outcome: 'resource_not_enrolled' };

/** Why a still-active reservation is being ended without the authority ever having moved. Both are terminal and both restore availability; they are kept apart because "the authorization was withdrawn" and "the artifact was never issued" are different governance facts. */
export type GovernedAuthorityReservationReleaseReason =
  /** The authorization artifact was revoked, cancelled, or never came into existence — including the compensation path when mandate persistence failed after the capacity was committed. */
  | 'authorization_ended'
  /** A privileged administrative withdrawal. Requires a system context. */
  | 'administrative';

export interface ReleaseGovernedAuthorityReservationInput {
  readonly tenantId: string;
  readonly reservationId: string;
  readonly reason: GovernedAuthorityReservationReleaseReason;
  readonly releasedAt?: string;
}

/** The tuple availability is asked about. Identical in shape to the coverage query's identity fields, so one identity rule is learned once. */
export interface GovernedAuthorityAvailabilityQuery {
  readonly tenantId: string;
  readonly holderRef: string;
  readonly resource: GovernedAuthorityResourceRef;
  readonly governedRight: GovernedRightType;
  readonly at: string;
}

// ---------------------------------------------------------------------------
// Governed authority encumbrance.
// ---------------------------------------------------------------------------

/**
 * Recording that a successfully executed governed action left the holder's
 * authority persistently constrained.
 *
 * Note what a caller does **not** supply, and why each absence matters:
 *
 * - **No status, no digest, no capacity figure it measured earlier.** Status
 *   and digest are the store's; capacity is recomputed inside the creating
 *   transaction, because a figure observed before the call is a snapshot
 *   rather than a guarantee.
 * - **No `reason` string.** The basis is `sourceExecutionRef` — a reference to
 *   evidence the mandate store already re-asserted the mandate's own
 *   authorization against. A constraint rooted in caller-supplied prose would
 *   be a constraint a caller could invent, which is precisely what makes
 *   "I hold this, so encumber it" impossible here.
 * - **No `expiresAt`.** A collateral arrangement does not end because the
 *   mandate authorizing it ran out. See `GovernedAuthorityEncumbrance`.
 */
export interface RecordGovernedAuthorityEncumbranceInput {
  readonly tenantId: string;
  /** Whose authority is constrained. Never the requester's, the executor's or the beneficiary's, unless one of them happens to be the holder. */
  readonly holderRef: string;
  readonly resource: GovernedAuthorityResourceRef;
  readonly governedRight: GovernedRightType;
  readonly scope: GovernedRightsScope;
  /** The governed action that executed, in the same capability vocabulary a `governed-execution` basis uses. Must be classified as encumbering, or the call is refused. */
  readonly sourceAction: string;
  readonly sourceMandateRef: string;
  /** The execution evidence this constraint is rooted in, and the idempotency key. */
  readonly sourceExecutionRef: string;
  readonly effectiveFrom: string;
  /**
   * The mandate whose reservation this constraint takes over from.
   *
   * Present, the reservations recorded against that mandate for this right are
   * moved to `'encumbered'` **inside the same commit section as the
   * constraint's creation**, but only once the constraints created under that
   * mandate cover the whole of what it reserved. That is the whole point of
   * putting encumbrances in this store: the pre-execution commitment and the
   * post-execution constraint are two phases of one commitment, and handing
   * over between them is one durable step. Neither of the two bad windows
   * exists — capacity is never freed for a constraint that has not been
   * recorded, and one commitment is never counted as two.
   *
   * A mandate whose terms permit several instalments keeps its reservation
   * active until the last of them lands; the reservation's residual is netted
   * against what has already been carved out of it, so the instalments still
   * to come stay protected without the ones already recorded being counted
   * twice.
   *
   * Absent, no reservation is touched. That is the correct behaviour for a
   * deployment that has not adopted reservation.
   */
  readonly consumesReservationsForMandateRef?: string;
  /** Defaults to `'<sourceExecutionRef>:<governedRight>'`, which is already one-per-execution-per-right. */
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
}

/**
 * What recording a constraint produced.
 *
 * Two outcomes rather than one, for exactly the reason
 * `AcquireGovernedAuthorityReservationOutcome` has two: a resource this
 * deployment holds no governed authority state for has no capacity to
 * constrain, so there is nothing to record and nothing that would be made
 * safer by recording it. The boundary is the same per-resource, one-way
 * enrolment boundary, so an action behaves identically on both sides of the
 * handoff.
 */
export type RecordGovernedAuthorityEncumbranceOutcome =
  /** The constraint stands. `replayed` distinguishes "recorded now" from "already recorded" without comparing capacity. */
  | { readonly outcome: 'encumbered'; readonly encumbrance: GovernedAuthorityEncumbrance; readonly replayed: boolean }
  /** The resource is not enrolled in right-scoped authority. Nothing was recorded, and nothing needed to be. */
  | { readonly outcome: 'resource_not_enrolled' };

/**
 * Ending a persistent constraint, so the authority it held becomes committable
 * again.
 *
 * Note what a caller does **not** supply, and why:
 *
 * - **No status, no digest, no capacity figure.** Status and digest are the
 *   store's; capacity is not written at all, it is re-derived from the
 *   constraints that are still active. There is deliberately no
 *   "restore capacity" operation to get wrong twice.
 * - **No holder, right, scope, resource, source action or source execution.**
 *   Every one of those is read from the stored constraint. A caller that could
 *   restate them could release a constraint on terms it chose rather than the
 *   ones Soberanía recorded.
 * - **No free-text reason.** `basis` is a typed union, and its
 *   `'governed-execution'` variant is only constructible by the release
 *   service, from an execution it performed itself against a trusted executor.
 *
 * This is a *store* API, not a request surface, exactly as `recordEncumbrance`
 * is. Production requesters reach it through the governed release lifecycle in
 * `../encumbrance-release-governance/`.
 */
export interface ReleaseGovernedAuthorityEncumbranceInput {
  readonly tenantId: string;
  readonly encumbranceId: string;
  /** Why this constraint may stop constraining. `'administrative'` requires `context.system`; `'governed-execution'` requires an action classified as releasing. See `GovernedAuthorityEncumbranceReleaseBasis`. */
  readonly basis: GovernedAuthorityEncumbranceReleaseBasis;
  readonly releasedAt?: string;
}
