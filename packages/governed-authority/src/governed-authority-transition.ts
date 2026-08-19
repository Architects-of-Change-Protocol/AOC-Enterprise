import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

import type { GovernedAuthorityBasis } from './governed-authority-basis.js';

/**
 * One recorded change to recognized governed authority: a quantity of one
 * right of one resource arriving at one party, and — when the basis conserves
 * — leaving another.
 *
 * Transitions are **append-only and never amended**. A position is the
 * projection of the transitions that touched it, which is what makes the
 * question "how did Bob come to control 25%?" answerable from stored records
 * rather than from a changelog someone remembered to write. This is not event
 * sourcing: positions are also stored, because the enforcement path must
 * answer coverage on every request and replaying history per request would be
 * a different system. The transitions are the audit chain; the positions are
 * the index.
 *
 * ## What causes one
 *
 * Deliberately not "an action was authorized". A `TransferMandate` is
 * permission to move a right, and permission that is never exercised must not
 * move anything — so mandate issuance produces **no** transition. What
 * produces one is evidence, accepted by this deployment, that the governed
 * external effect actually happened.
 *
 * Equally deliberately not "an external system said something later". A
 * reported reversal or correction is an observation, and an observation must
 * not silently rewrite authority. Reversal is a governance event that would
 * need its own authority basis; until one exists, lifecycle evidence changes
 * nothing here. See `docs/enterprise/AOC_GOVERNED_AUTHORITY.md`.
 *
 * ## Generic, not transfer-shaped
 *
 * `TRANSFER` is the first consumer and the reason this exists, but nothing in
 * this record names it: `basis.capability` carries whichever governed action
 * produced the evidence. A future governed action that legitimately moves
 * authority records the same primitive, and one that does not simply never
 * calls it. There is no plugin registry, no action dispatch table and no
 * per-action subclass, because a state transition is not a framework.
 */
export interface GovernedAuthorityTransition {
  readonly id: string;

  readonly tenantId: string;

  /** Position in this tenant's append-only transition chain (1-based), assigned by the store. Restart-stable and independent of insertion timing. */
  readonly sequence: number;

  readonly resourceKind: string;
  readonly resourceId: string;

  readonly governedRight: GovernedRightType;

  /** How much moved. Must be commensurable with both the debited and the credited position, and is never split or converted. */
  readonly scope: GovernedRightsScope;

  /** The party debited. Absent exactly when `basis` is an issuance basis — the two cases agree by construction, and a store rejects any pairing that does not. */
  readonly fromActorRef?: string;

  /** The party credited. Always present: a transition that credits nobody would be a burn, and no governed action in Soberanía burns authority. */
  readonly toActorRef: string;

  readonly basis: GovernedAuthorityBasis;

  /** When the change took effect, in the governed world. Never earlier than the credited position's `effectiveFrom`. */
  readonly occurredAt: string;
  /** When Soberanía durably recorded it. Distinct from `occurredAt` on purpose: Soberanía records what it was told, and when it was told. */
  readonly recordedAt: string;

  readonly correlationId?: string;

  /** The digest of the preceding transition in this tenant's chain. Absent on the first. */
  readonly previousDigest?: string;
  /** Tamper-evidence digest over this row and its predecessor, computed and owned by the store. */
  readonly digest: string;
}
