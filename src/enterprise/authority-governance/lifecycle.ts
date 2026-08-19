import {
  governedAuthorityPositionKey,
  isGovernedAuthorityIssuanceBasis,
  isZeroGovernedRightsScope,
  type GovernedAuthorityBasis,
  type GovernedAuthorityPosition,
  type GovernedAuthorityTransition,
} from '@aoc-enterprise/governed-authority';
import {
  governedRightsScopeSum,
  governedRightsScopeWithin,
  isGovernedRightType,
  serializeGovernedRightsScope,
  type GovernedRightType,
  type GovernedRightsScope,
} from '@aoc-enterprise/governed-authorization';

import { computeDigest } from '../governance-store/digest.js';
import { AuthorityGovernanceError } from './errors.js';

/**
 * The rules that decide what a governed authority store may write, expressed
 * once as pure functions over records so the in-memory and SQLite
 * implementations cannot drift into two different notions of conservation.
 *
 * Exactly the arrangement `../transfer-governance/lifecycle.ts` uses for the
 * mandate lifecycle, and for the same reason: the invariant that matters here
 * — authority is conserved, never negative, and never coerced between
 * incommensurable quantities — must hold identically against a test double and
 * against a real database, or the test double proves nothing.
 *
 * Every scope comparison and every scope addition below goes through
 * `governedRightsScopeWithin` and `governedRightsScopeSum` from
 * `@aoc-enterprise/governed-authorization`. No arithmetic on `basisPoints` or
 * `units` is performed here directly. That is deliberate: those two functions
 * already encode the kind-refusal and denomination-refusal semantics four
 * governed actions agreed on, and re-deriving them would be re-deriving the
 * exact escalation they exist to prevent.
 */

/** Rejects a scope that is not a well-formed, non-negative integer quantity, before it can reach a stored position. */
export function assertValidAuthorityScope(scope: GovernedRightsScope, fieldName: string): GovernedRightsScope {
  if (scope.kind === 'proportional') {
    if (!Number.isSafeInteger(scope.basisPoints) || scope.basisPoints < 0) {
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_SCOPE_INVALID',
        `${fieldName} must carry a non-negative integer basisPoints; received '${String(scope.basisPoints)}'.`,
        { fieldName },
      );
    }
    return scope;
  }
  if (!Number.isSafeInteger(scope.units) || scope.units < 0) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_SCOPE_INVALID',
      `${fieldName} must carry a non-negative integer units count; received '${String(scope.units)}'.`,
      { fieldName },
    );
  }
  if (typeof scope.unitDenomination !== 'string' || scope.unitDenomination.length === 0) {
    throw new AuthorityGovernanceError('GOVERNED_AUTHORITY_SCOPE_INVALID', `${fieldName} must name a non-empty unit denomination.`, { fieldName });
  }
  return scope;
}

/** Refuses a movement of nothing. A transition that moves zero would be an audit entry claiming a change that did not happen. */
export function assertNonZeroAuthorityScope(scope: GovernedRightsScope, fieldName: string): GovernedRightsScope {
  if (isZeroGovernedRightsScope(scope)) {
    throw new AuthorityGovernanceError('GOVERNED_AUTHORITY_SCOPE_INVALID', `${fieldName} must be a non-zero quantity; a transition of nothing is not a transition.`, {
      fieldName,
    });
  }
  return scope;
}

/** Rejects a governed right this build does not know, rather than storing a position nothing can ever match. */
export function assertKnownGovernedRight(value: string): void {
  if (!isGovernedRightType(value)) {
    throw new AuthorityGovernanceError('GOVERNED_AUTHORITY_SCOPE_INVALID', `'${value}' is not a canonical governed right type.`, { governedRight: value });
  }
}

/**
 * A basis and a movement must agree about whether anything is being debited.
 * An issuance that names a source would be a transfer pretending to be a
 * bootstrap; a movement that names none would be an issuance pretending to be
 * a transfer. Both are refused rather than normalized, because either would
 * make the conservation invariant unverifiable from the stored record.
 */
export function assertBasisMatchesMovement(basis: GovernedAuthorityBasis, fromActorRef: string | undefined): void {
  const issuance = isGovernedAuthorityIssuanceBasis(basis);
  if (issuance && fromActorRef !== undefined) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_BASIS_INVALID',
      `A '${basis.kind}' basis creates authority and must not name a source holder; '${fromActorRef}' was named.`,
      { basisKind: basis.kind },
    );
  }
  if (!issuance && fromActorRef === undefined) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_BASIS_INVALID',
      `A '${basis.kind}' basis moves existing authority and must name the source holder it is debited from.`,
      { basisKind: basis.kind },
    );
  }
}

/** Refuses a self-transition. Moving a right from a party to itself changes nothing and would record a movement that did not occur. */
export function assertDistinctHolders(fromActorRef: string, toActorRef: string): void {
  if (fromActorRef === toActorRef) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_BASIS_INVALID',
      `A governed authority transition must move a right between two different parties; '${fromActorRef}' was named as both source and target.`,
      { holderRef: fromActorRef },
    );
  }
}

/**
 * Adds two commensurable scopes, converting the shared primitive's `null`
 * refusal into this module's typed error. The `null` is never treated as a
 * zero: two quantities that cannot be added were about to be, and continuing
 * would record a total nothing could justify.
 */
export function addAuthorityScopes(a: GovernedRightsScope, b: GovernedRightsScope, context: Readonly<Record<string, unknown>>): GovernedRightsScope {
  const sum = governedRightsScopeSum(a, b);
  if (sum === null) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
      'These two governed rights scopes cannot be added: they are of different kinds, or name different unit denominations, and Soberanía holds no conversion between them.',
      { ...context, a: serializeGovernedRightsScope(a), b: serializeGovernedRightsScope(b) },
    );
  }
  return sum;
}

/**
 * Subtracts `amount` from `available`, refusing anything that would take a
 * position below zero.
 *
 * Containment is decided by `governedRightsScopeWithin` rather than by
 * comparing numbers here, so an attempt to debit 500 units from a proportional
 * position — or 500 of one denomination from 500 of another — is refused as
 * incompatible rather than silently succeeding on a numeric comparison that
 * should never have been made.
 */
export function subtractAuthorityScope(
  available: GovernedRightsScope,
  amount: GovernedRightsScope,
  context: Readonly<Record<string, unknown>>,
): GovernedRightsScope {
  if (available.kind !== amount.kind || (available.kind === 'unitized' && amount.kind === 'unitized' && available.unitDenomination !== amount.unitDenomination)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
      'This governed authority position cannot be debited by that quantity: the two scopes are of different kinds, or name different unit denominations.',
      { ...context, available: serializeGovernedRightsScope(available), requested: serializeGovernedRightsScope(amount) },
    );
  }
  if (!governedRightsScopeWithin(amount, available)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
      'This governed authority transition would debit more than the source holder controls; governed authority is never negative.',
      { ...context, available: serializeGovernedRightsScope(available), requested: serializeGovernedRightsScope(amount) },
    );
  }
  if (available.kind === 'proportional' && amount.kind === 'proportional') {
    return { kind: 'proportional', basisPoints: available.basisPoints - amount.basisPoints };
  }
  if (available.kind === 'unitized' && amount.kind === 'unitized') {
    return { kind: 'unitized', units: available.units - amount.units, unitDenomination: available.unitDenomination };
  }
  // Unreachable: the kind guard above already refused every mixed pairing.
  // Kept as a closed refusal rather than a cast, so a future third scope kind
  // fails here rather than silently producing a quantity nobody defined.
  throw new AuthorityGovernanceError('GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE', 'These two governed rights scopes are not commensurable.', context);
}

// ---------------------------------------------------------------------------
// Integrity. `computeDigest` is the Governance Store's own canonical digest
// primitive (sha256 over canonical JSON), reused rather than re-implemented —
// exactly as `../transfer-governance/sqlite-mandate-store.ts` reuses it for
// `terms_digest`.
//
// Governance *Reference* Integrity is deliberately NOT reused: that mechanism
// chains references belonging to one governance evaluation, and an authority
// transition belongs to a tenant's authority history rather than to any single
// evaluation. Reusing it would have meant either inventing an evaluation to
// hang transitions from, or widening a sealed chain to mean something else.
// The canonical digest primitive underneath it is the right layer, and the
// chaining here is this store's own.
// ---------------------------------------------------------------------------

/** The exact bytes a position's digest covers. Every field that could be tampered with to widen authority is in here; the digest itself obviously is not. */
export function projectPositionForDigest(position: Omit<GovernedAuthorityPosition, 'digest'>): Readonly<Record<string, unknown>> {
  return {
    id: position.id,
    tenantId: position.tenantId,
    actorRef: position.actorRef,
    resourceKind: position.resourceKind,
    resourceId: position.resourceId,
    governedRight: position.governedRight,
    scope: serializeGovernedRightsScope(position.scope),
    effectiveFrom: position.effectiveFrom,
    ...(position.expiresAt !== undefined ? { expiresAt: position.expiresAt } : {}),
    createdAt: position.createdAt,
    updatedAt: position.updatedAt,
    lastTransitionRef: position.lastTransitionRef,
  };
}

export function computePositionDigest(position: Omit<GovernedAuthorityPosition, 'digest'>): string {
  return computeDigest(projectPositionForDigest(position));
}

/** The exact bytes a transition's digest covers, including its predecessor's digest — which is what makes the history a chain rather than a pile of independently-rewritable rows. */
export function projectTransitionForDigest(transition: Omit<GovernedAuthorityTransition, 'digest'>): Readonly<Record<string, unknown>> {
  return {
    id: transition.id,
    tenantId: transition.tenantId,
    sequence: transition.sequence,
    resourceKind: transition.resourceKind,
    resourceId: transition.resourceId,
    governedRight: transition.governedRight,
    scope: serializeGovernedRightsScope(transition.scope),
    ...(transition.fromActorRef !== undefined ? { fromActorRef: transition.fromActorRef } : {}),
    toActorRef: transition.toActorRef,
    basis: transition.basis,
    occurredAt: transition.occurredAt,
    recordedAt: transition.recordedAt,
    ...(transition.correlationId !== undefined ? { correlationId: transition.correlationId } : {}),
    ...(transition.previousDigest !== undefined ? { previousDigest: transition.previousDigest } : {}),
  };
}

export function computeTransitionDigest(transition: Omit<GovernedAuthorityTransition, 'digest'>): string {
  return computeDigest(projectTransitionForDigest(transition));
}

/** Recomputes a position's digest on read and refuses a mismatch. A position whose stored bytes changed after commit is never reconstructed into recognized authority. */
export function assertPositionIntegrity(position: GovernedAuthorityPosition): GovernedAuthorityPosition {
  const { digest: _digest, ...rest } = position;
  const recomputed = computePositionDigest(rest);
  if (recomputed !== position.digest) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_RECORD_CORRUPTED',
      `Governed authority position '${position.id}' does not match its stored digest; refusing to recognize authority from it.`,
      { positionId: position.id },
    );
  }
  return position;
}

/** Recomputes a transition's digest on read and refuses a mismatch, including a broken link to its predecessor. */
export function assertTransitionIntegrity(transition: GovernedAuthorityTransition): GovernedAuthorityTransition {
  const { digest: _digest, ...rest } = transition;
  const recomputed = computeTransitionDigest(rest);
  if (recomputed !== transition.digest) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_RECORD_CORRUPTED',
      `Governed authority transition '${transition.id}' does not match its stored digest; the authority history has been altered after commit.`,
      { transitionId: transition.id },
    );
  }
  return transition;
}

/** Verifies that an ordered run of transitions forms an unbroken chain. A removed or reordered transition is detectable even when every remaining row's own digest still verifies. */
export function assertTransitionChain(transitions: readonly GovernedAuthorityTransition[]): readonly GovernedAuthorityTransition[] {
  let previousDigest: string | undefined;
  for (const transition of transitions) {
    assertTransitionIntegrity(transition);
    if (transition.previousDigest !== previousDigest) {
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_RECORD_CORRUPTED',
        `Governed authority transition '${transition.id}' does not chain to the transition before it; the authority history is broken or incomplete.`,
        { transitionId: transition.id, expectedPreviousDigest: previousDigest, recordedPreviousDigest: transition.previousDigest },
      );
    }
    previousDigest = transition.digest;
  }
  return transitions;
}

// ---------------------------------------------------------------------------
// Identifier derivation. Shared by both stores so a position carries the same
// id whichever backend wrote it, and so an id is unique by construction rather
// than by a counter that two tenants could each start from 1.
// ---------------------------------------------------------------------------

/**
 * A position's id, derived from the tuple that identifies it.
 *
 * Deterministic rather than generated: a position *is* its
 * (tenant, actor, resource, right) tuple, so deriving the id from that tuple
 * makes a duplicate row impossible to name, and makes the in-memory and SQLite
 * stores agree without either of them sharing a counter. Sixteen hex
 * characters of a canonical digest — collision-resistant far past the point
 * where an authority store has other problems, and short enough to read in a
 * log line.
 */
export function deriveAuthorityPositionId(key: {
  readonly tenantId: string;
  readonly actorRef: string;
  readonly resourceKind: string;
  readonly resourceId: string;
  readonly governedRight: GovernedRightType;
}): string {
  return `governed-authority-position-${computeDigest({ key: governedAuthorityPositionKey(key) }).slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

/** An issuance transition's id. Unique by the chain position it occupies, which the store's `UNIQUE (tenant_id, sequence)` already guarantees. */
export function deriveAuthorityIssuanceTransitionId(tenantId: string, sequence: number): string {
  return `governed-authority-transition-${computeDigest({ tenantId }).slice('sha256:'.length, 'sha256:'.length + 8)}-${sequence}`;
}

/**
 * A movement transition's id, derived from the execution that caused it and
 * the right it moved.
 *
 * Deterministic on purpose: it is the same key the store's
 * `UNIQUE (tenant_id, execution_ref, governed_right)` constraint enforces, so
 * a replay that somehow reached the insert would collide rather than record a
 * second movement. The tenant is included because an execution reference is
 * only unique within one.
 */
export function deriveAuthorityMovementTransitionId(prefix: string, tenantId: string, executionRef: string, governedRight: GovernedRightType): string {
  return `${prefix}-${computeDigest({ tenantId, executionRef }).slice('sha256:'.length, 'sha256:'.length + 12)}-${governedRight}`;
}
