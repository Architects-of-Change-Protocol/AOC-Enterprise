import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

/**
 * How much of a holder's underlying governed authority remains subject to a
 * persistent constraint **after** a governed action has successfully executed.
 *
 * ## The question this answers, and the four it does not
 *
 * ```
 * GovernedAuthorityPosition       how much underlying authority does Holder H possess?
 * GovernedRepresentativeAuthority who may exercise H's authority?
 * AuthorityGrant / delegation     through what lineage may a requester invoke the action?
 * GovernedAuthorityReservation    how much of H's authority is committed to a live authorization
 *                                 that has not yet reached its final domain effect?
 * GovernedAuthorityEncumbrance    how much of H's authority stays constrained once that effect
 *                                 has happened?
 * ```
 *
 * Those are five independent facts and no two of them substitute.
 *
 * ## Why this is not a reservation under another name
 *
 * A reservation is a *pre-execution* commitment. It is bounded by the
 * authorization that justifies it — it carries a required `expiresAt` taken
 * from the mandate's own expiry, and it ends when that mandate does, by
 * execution, revocation or lapse.
 *
 * An encumbrance is what a *completed* execution leaves behind. It has no
 * `expiresAt` at all, deliberately: the mandate's expiry bounds how long an
 * executor may still act, and says nothing about how long the arrangement that
 * executor already created continues to exist. An executed
 * `CollateralizationMandate` may be exhausted, expired or revoked while the
 * encumbrance it produced is still `'active'` — different lifecycles, no
 * contradiction, and collapsing them would make "committed until execution"
 * and "constrained indefinitely afterwards" the same word.
 *
 * Reservation and encumbrance are two phases of **one** commitment, never two
 * commitments. The handoff terminalizes the reservation to `'encumbered'` in
 * the same commit section that creates this record, so the quantity is counted
 * once throughout and there is no instant at which it is counted twice or not
 * at all.
 *
 * ## What it emphatically is not
 *
 * - **Not ownership, and not a claim by anybody.** The underlying authority
 *   stays exactly where it was: Alice with 5 000 bp and a 4 000 bp encumbrance
 *   still *holds* 5 000 bp, and her `GovernedAuthorityPosition` is not
 *   rewritten. Nobody — not the requester, not the representative, not the
 *   secured party, not AOC — acquires the encumbered scope. There is
 *   deliberately no `beneficiaryRef`, no `securedPartyRef` and no `ownerRef` on
 *   this record: naming a party would invite exactly the reading it exists to
 *   prevent.
 * - **Not a transfer.** Creating one debits nothing, credits nothing, and
 *   produces no `GovernedAuthorityTransition`.
 * - **Not a delegation, and not a representation.** It says nothing about who
 *   may invoke an action or who may act for the holder. It cannot confer a
 *   capability, and it cannot rescue a request that was going to be denied —
 *   it can only ever narrow.
 * - **Not a legal lien, pledge, mortgage, security interest or registration.**
 *   This is one deployment's record of its own governed state. AOC creates no
 *   legal encumbrance, perfects nothing, files nothing, ranks nothing, and
 *   makes no claim that any external system agrees with it. There is
 *   deliberately no priority, seniority or ranking field for the same reason.
 * - **Not an inter-action conflict policy.** The record says a portion of the
 *   holder's authority is constrained; it does not by itself decide which
 *   future actions conflict. What consults it is the capacity accounting for
 *   commitments against the same holder, resource and right.
 */
export interface GovernedAuthorityEncumbrance {
  readonly id: string;

  /** The organization whose governed authority is constrained. Never crossed: an encumbrance in one tenant can never reduce capacity in another. */
  readonly tenantId: string;

  /**
   * Whose underlying authority is constrained — **not** who asked for the
   * action, who executed it, and not who benefits from it.
   *
   * An encumbrance created while a representative acted for Alice constrains
   * *Alice's* authority. Two different representatives of the same holder, and
   * a delegated agent reaching her through a third lineage, all draw on the
   * same constrained pool; none of them gets a pool of their own.
   */
  readonly holderRef: string;

  readonly resourceKind: string;
  readonly resourceId: string;

  readonly governedRight: GovernedRightType;

  /** How much of the holder's authority stands constrained. Always present and always non-zero: an encumbrance of nothing would constrain nothing and record a commitment that was never made. */
  readonly scope: GovernedRightsScope;

  // -------------------------------------------------------------------------
  // The trusted basis. An encumbrance is never self-asserted: it exists
  // because a governed action *executed*, and these three references are what
  // make that checkable rather than claimed.
  // -------------------------------------------------------------------------

  /** The governed action whose successful execution created the constraint, in the same capability vocabulary a `governed-execution` basis uses (`'collateralize'`). */
  readonly sourceAction: string;
  /** The authorization artifact the execution ran under. What makes "which mandate produced this constraint?" answerable without a second audit log. */
  readonly sourceMandateRef: string;
  /**
   * The execution evidence that created it — the whole of the trusted basis,
   * and the idempotency key.
   *
   * There is deliberately no free-text `reason`. A constraint rooted in a
   * string a caller supplied would be a constraint a caller could invent, and
   * an execution reference is the one thing a requester cannot fabricate:
   * recording it required the mandate store to re-assert the mandate's own
   * authorization against the reported terms first.
   */
  readonly sourceExecutionRef: string;
  /** The pre-execution commitment this constraint took over from, when there was one. Lineage only — availability never reads it, because that reservation is terminal by the time this record exists. */
  readonly sourceReservationRef?: string;

  readonly effectiveFrom: string;

  readonly status: GovernedAuthorityEncumbranceStatus;

  /** When a legitimate release ended it, and on what basis. Both absent while `'active'`, both present once `'released'`. */
  readonly releasedAt?: string;
  readonly releaseBasis?: GovernedAuthorityEncumbranceReleaseBasis;

  /** The key creation is idempotent on. Derived from the source execution and right, so a replayed execution restates one constraint rather than adding a second. */
  readonly idempotencyKey: string;
  readonly correlationId?: string;

  readonly createdAt: string;
  readonly updatedAt: string;

  /** Tamper-evidence digest over this row, computed and owned by the store. Never supplied by a caller. */
  readonly digest: string;
}

/**
 * The two states a governance act can put an encumbrance in.
 *
 * ```
 * active     the constraint stands; compatible future commitments must respect it
 * released   a legitimate release ended it; the capacity genuinely returns
 * ```
 *
 * Deliberately two, and deliberately not three.
 *
 * There is **no `'expired'`**, because this record carries no `expiresAt` to
 * derive one from. A collateral arrangement does not stop existing because the
 * mandate that authorized it ran out, and inventing an expiry so the lifecycle
 * looked symmetrical would silently free capacity for an arrangement that is
 * still live externally — the precise failure this whole layer exists to
 * prevent.
 *
 * There is no `'superseded'` either: that is a relationship between two
 * records rather than a property of one, exactly as the collateralization
 * mandate lifecycle already reasons about it.
 *
 * A `'released'` record is kept, never deleted. Availability is derived from
 * the records that are still `'active'`, so releasing twice cannot return the
 * same capacity twice, and the history stays auditable.
 */
export type GovernedAuthorityEncumbranceStatus = 'active' | 'released';

/**
 * Why a persistent constraint stopped constraining.
 *
 * Exactly one basis today, and the narrowness is the finding rather than an
 * omission. `COLLATERALIZE` has no authorized release: its `recordRelease` is
 * an *observation* an external system reported, taken on trust from a
 * caller-asserted `reportedBy`, and the collateralization module already
 * refuses to let such a report decrement `committedScope` on the stated
 * grounds that AOC cannot verify an external encumbrance actually ended.
 * Letting the same unverified report free authority capacity would be that
 * refusal reversed, and would hand any tenant-scoped caller a way to
 * manufacture headroom by reporting a release.
 *
 * So there is no `'source_release_evidence'` basis here. Authorizing a
 * discharge — with its own request, decision, authority check and evidence —
 * is a separate governed action this phase deliberately does not invent. See
 * `docs/enterprise/AOC_GOVERNED_AUTHORITY_ENCUMBRANCE.md`, "Production
 * discharge remains a gap".
 */
export type GovernedAuthorityEncumbranceReleaseBasis =
  /** A privileged administrative withdrawal — migration, recovery, or an operator acting on evidence AOC itself cannot verify. Requires a system context, and is never reachable from a request path. */
  'administrative';

/**
 * Whether an encumbrance counts against the authority still free for a further
 * commitment.
 *
 * Kept as one predicate so no capacity computation, no store and no test can
 * re-spell "still constrains" and drift — the same arrangement
 * `governedAuthorityReservationReducesAvailability` already uses. A constraint
 * that has not begun does not count: authority constrained from next week is
 * not authority constrained today.
 */
export function governedAuthorityEncumbranceConstrains(encumbrance: GovernedAuthorityEncumbrance, at: string): boolean {
  if (encumbrance.status !== 'active') return false;
  return Date.parse(at) >= Date.parse(encumbrance.effectiveFrom);
}
