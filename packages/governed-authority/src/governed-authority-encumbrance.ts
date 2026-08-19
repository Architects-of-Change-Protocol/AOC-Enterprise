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
 *   secured party, not Soberanía — acquires the encumbered scope. There is
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
 *   This is one deployment's record of its own governed state. Soberanía creates no
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

  /** When a legitimate release ended it, and on what kind of basis. Both absent while `'active'`, both present once `'released'`. */
  readonly releasedAt?: string;
  readonly releaseBasis?: GovernedAuthorityEncumbranceReleaseBasisKind;

  // -------------------------------------------------------------------------
  // Release lineage. Present exactly when the matching basis kind is, absent
  // otherwise, and every field is a *reference* rather than a copied payload:
  // what makes a terminalization checkable is that it points at artifacts
  // somebody else recorded, not that it restates them.
  // -------------------------------------------------------------------------

  /** The governed release action whose execution terminalized this constraint. `'governed-execution'` basis only. */
  readonly releaseAction?: string;
  /** The release authorization the execution ran under. `'governed-execution'` basis only. */
  readonly releaseMandateRef?: string;
  /**
   * The confirmed release execution evidence — the whole of the trusted basis,
   * and the idempotency key for terminalization.
   *
   * One execution reference terminalizes at most one constraint. A second
   * constraint naming the same reference is refused rather than released, so a
   * single confirmed release can never be spread across siblings it did not
   * discharge. `'governed-execution'` basis only.
   */
  readonly releaseExecutionRef?: string;
  /** The operator a privileged withdrawal was performed by. `'administrative'` basis only, and required there: an override nobody is named for is an override nobody can be asked about. */
  readonly releasedBy?: string;
  /** Why the privileged withdrawal was performed, in the deployment's own closed vocabulary. `'administrative'` basis only. */
  readonly releaseReasonCode?: string;

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
 * Why a persistent constraint stopped constraining, as a stored discriminant.
 *
 * ```
 * governed-execution   a governed release action was authorized and its execution
 *                      was confirmed successful by a trusted executor
 * administrative       a privileged operator withdrew it — migration, recovery, or
 *                      an operator acting on evidence Soberanía itself cannot verify
 * ```
 *
 * Deliberately two, and deliberately not three. There is **no**
 * `'source_release_evidence'`: `COLLATERALIZE`'s `recordRelease` is an
 * *observation* an external system reported, taken on trust from a
 * caller-asserted `reportedBy`, and the collateralization module already
 * refuses to let such a report decrement `committedScope` on the stated
 * grounds that Soberanía cannot verify an external encumbrance actually ended.
 * Letting the same unverified report free authority capacity would be that
 * refusal reversed, and would hand any tenant-scoped caller a way to
 * manufacture headroom by reporting a release.
 *
 * The two that exist are kept apart because they are different governance
 * facts and must stay distinguishable forever in the audit record: one says
 * "this deployment completed its configured governed release process", the
 * other says "an operator overrode the state". Collapsing them would make an
 * override indistinguishable from a discharge.
 *
 * See `docs/enterprise/AOC_GOVERNED_ENCUMBRANCE_RELEASE.md`.
 */
export type GovernedAuthorityEncumbranceReleaseBasisKind = 'governed-execution' | 'administrative';

/**
 * The typed grounds a terminalization is asked for on.
 *
 * A *union*, never a free-text reason, for the same reason
 * `GovernedAuthorityBasis` is one: a constraint that could be ended by a
 * string a caller chose would be a constraint a caller could end. Each variant
 * carries exactly the references that make its own claim checkable, and
 * nothing else — no payload, no provider response, no prose.
 *
 * Neither variant is reachable from a request path. `'governed-execution'` is
 * constructed only by the release service, from an execution it performed
 * itself against a trusted executor port; `'administrative'` requires a
 * privileged system context.
 */
export type GovernedAuthorityEncumbranceReleaseBasis =
  /**
   * A confirmed successful execution of a governed release mandate.
   *
   * `executionRef` is the trusted basis and the idempotency key. The store
   * re-checks that the named action is classified as releasing and that no
   * other constraint has already been terminalized under the same execution,
   * so one confirmed release can never discharge a sibling it did not cover.
   */
  | {
      readonly kind: 'governed-execution';
      readonly action: string;
      readonly mandateRef: string;
      readonly executionRef: string;
    }
  /**
   * A privileged administrative withdrawal — migration, recovery, or an
   * operator acting on evidence Soberanía itself cannot verify.
   *
   * Requires a system context, and requires both an actor and a reason code:
   * an override nobody is named for, for no recorded reason, is an override
   * nobody can be asked about afterwards. It is deliberately *not* a way to
   * perform an ordinary discharge without governance — a deployment that
   * routinely reaches for it has disabled its own release lifecycle, and the
   * distinct stored basis kind is what makes that visible in the audit record.
   */
  | {
      readonly kind: 'administrative';
      readonly assertedBy: string;
      readonly reasonCode: string;
    };

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
