import {
  governedRepresentativeAuthorityContainmentBreach,
  isGovernedRepresentativeIssuanceBasis,
  type GovernedRepresentativeAuthority,
  type GovernedRepresentativeBasis,
  type GovernedRepresentativeScopeLimit,
} from '@aoc-enterprise/governed-authority';
import {
  governedRightsScopeWithin,
  isGovernedRightType,
  serializeGovernedRightsScope,
  type GovernedRightType,
} from '@aoc-enterprise/governed-authorization';

import { computeDigest } from '../governance-store/digest.js';
import { AuthorityGovernanceError } from './errors.js';
import type { AuthorityGovernanceContext, GovernedRepresentationDelegationRecord } from './representation-contracts.js';

/**
 * The rules that decide what a Governed Representation Store may write,
 * expressed once as pure functions over records so the in-memory and SQLite
 * implementations cannot drift into two different notions of who may act for
 * whom.
 *
 * The same arrangement `lifecycle.ts` uses for authority positions, and for
 * the same reason: the invariant that matters here — a representation is bound
 * to one holder, one resource, an enumerated set of rights and actions, and a
 * ceiling, and no chain operation may broaden any of them — must hold
 * identically against a test double and against a real database, or the test
 * double proves nothing.
 *
 * Every scope comparison goes through `governedRightsScopeWithin` from
 * `@aoc-enterprise/governed-authorization`. No arithmetic on `basisPoints` or
 * `units` happens here, deliberately: that function already encodes the
 * kind-refusal and denomination-refusal semantics four governed actions agreed
 * on.
 */

// ---------------------------------------------------------------------------
// Field-level coherence.
// ---------------------------------------------------------------------------

/** Refuses a representation of a party by itself. A holder needs no permission to exercise its own authority, and storing such a binding would imply that it might. */
export function assertDistinctRepresentative(holderRef: string, representativeRef: string): void {
  if (holderRef === representativeRef) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_INVALID',
      `A party does not represent itself; '${holderRef}' was named as both holder and representative.`,
      { holderRef },
    );
  }
}

/**
 * Refuses an empty right list.
 *
 * Empty is not a wildcard here and must never become one. A representation
 * naming no right would be indistinguishable, at the point of use, from one
 * naming every right — and the reading that fails open is the one that would
 * be chosen by accident.
 */
export function assertRepresentedRights(governedRights: readonly GovernedRightType[]): readonly GovernedRightType[] {
  if (governedRights.length === 0) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_INVALID',
      'A representation must enumerate at least one governed right; an empty list is not a wildcard and is never read as one.',
    );
  }
  for (const right of governedRights) {
    if (!isGovernedRightType(right)) {
      throw new AuthorityGovernanceError('GOVERNED_REPRESENTATION_INVALID', `'${String(right)}' is not a canonical governed right type.`, { governedRight: right });
    }
  }
  return governedRights;
}

/** Refuses an empty action list, for exactly the reason an empty right list is refused. */
export function assertRepresentedActions(actions: readonly string[]): readonly string[] {
  if (actions.length === 0) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_INVALID',
      'A representation must enumerate at least one governed action; an empty list is not a wildcard and is never read as one.',
    );
  }
  if (actions.some((action) => typeof action !== 'string' || action.length === 0)) {
    throw new AuthorityGovernanceError('GOVERNED_REPRESENTATION_INVALID', 'Every action a representation names must be a non-empty identifier.');
  }
  return actions;
}

/** Refuses a ceiling that is not a well-formed non-negative integer quantity, and a bounded ceiling of zero — a representation permitting nothing is not a representation. */
export function assertRepresentativeScopeLimit(scopeLimit: GovernedRepresentativeScopeLimit): GovernedRepresentativeScopeLimit {
  if (scopeLimit.kind === 'unbounded') return scopeLimit;
  const maximum = scopeLimit.maximum;
  if (maximum.kind === 'proportional') {
    if (!Number.isSafeInteger(maximum.basisPoints) || maximum.basisPoints <= 0) {
      throw new AuthorityGovernanceError(
        'GOVERNED_REPRESENTATION_INVALID',
        `A bounded representation ceiling must carry a positive integer basisPoints; received '${String(maximum.basisPoints)}'.`,
      );
    }
    return scopeLimit;
  }
  if (!Number.isSafeInteger(maximum.units) || maximum.units <= 0) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_INVALID',
      `A bounded representation ceiling must carry a positive integer units count; received '${String(maximum.units)}'.`,
    );
  }
  if (typeof maximum.unitDenomination !== 'string' || maximum.unitDenomination.length === 0) {
    throw new AuthorityGovernanceError('GOVERNED_REPRESENTATION_INVALID', 'A unitized representation ceiling must name a non-empty unit denomination.');
  }
  return scopeLimit;
}

// ---------------------------------------------------------------------------
// Who may grant. The single most security-sensitive rule in this module: if a
// delegated administrator could reach a grant path about itself, the hole this
// whole layer closes would reopen one function call lower down.
// ---------------------------------------------------------------------------

/**
 * Enforces who may create a representation.
 *
 * Three issuing bases — administrative bootstrap, Authority Graph delegation,
 * and recognized external representation — all require `context.system`,
 * because all three *create* a representation relation that did not exist.
 * That context is never reachable from a governed action, a request handler or
 * an HTTP route.
 *
 * `representative-redelegation` is the one non-privileged path, and it is safe
 * for a structural reason rather than a policy one: it cannot create anything.
 * Its holder and resource are copied from the parent rather than supplied, and
 * every other dimension is checked for containment, so the worst a caller can
 * do is narrow a representation it already legitimately holds. It is permitted
 * from a tenant context only when the caller *is* that parent's representative.
 */
export function assertMayGrantRepresentation(
  context: AuthorityGovernanceContext,
  basis: GovernedRepresentativeBasis,
  parent: GovernedRepresentativeAuthority | null,
): void {
  if (context.system) return;

  if (isGovernedRepresentativeIssuanceBasis(basis)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_GRANT_NOT_PERMITTED',
      `A '${basis.kind}' representation asserts a new holder relationship and may only be created from a privileged administrative context. There is no path by which a party appoints itself the representative of another.`,
      { basisKind: basis.kind },
    );
  }

  if (parent === null) {
    throw new AuthorityGovernanceError('GOVERNED_REPRESENTATION_BASIS_INVALID', 'A redelegated representation must name a parent representation that exists.');
  }
  if (context.actorId === undefined || context.actorId !== parent.representativeRef) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_GRANT_NOT_PERMITTED',
      `Only '${parent.representativeRef}' may redelegate representation '${parent.id}'; the calling context is '${String(context.actorId)}'.`,
      { parentId: parent.id },
    );
  }
}

/** The same rule for withdrawal: a system context, or — for a redelegated binding — the representative that created it. A root binding is withdrawn administratively, by whoever could have granted it. */
export function assertMayRevokeRepresentation(
  context: AuthorityGovernanceContext,
  representation: GovernedRepresentativeAuthority,
  parent: GovernedRepresentativeAuthority | null,
): void {
  if (context.system) return;
  if (parent !== null && context.actorId !== undefined && context.actorId === parent.representativeRef) return;
  throw new AuthorityGovernanceError(
    'GOVERNED_REPRESENTATION_GRANT_NOT_PERMITTED',
    `The calling context may not withdraw representation '${representation.id}'.`,
    { representativeAuthorityId: representation.id },
  );
}

// ---------------------------------------------------------------------------
// Basis corroboration.
// ---------------------------------------------------------------------------

/** Refuses an evidence basis carrying no evidence. Unverifiable free-text provenance is worse than none — the same rule `recognized-external-evidence` obeys for authority positions. */
export function assertRepresentationBasisShape(basis: GovernedRepresentativeBasis): void {
  if (basis.kind === 'recognized-external-representation' && basis.evidenceRefs.length === 0) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_BASIS_INVALID',
      "A 'recognized-external-representation' basis must reference the evidence this deployment relied on; a basis with no evidence is unverifiable provenance.",
    );
  }
  if (typeof basis.assertedBy !== 'string' || basis.assertedBy.length === 0) {
    throw new AuthorityGovernanceError('GOVERNED_REPRESENTATION_BASIS_INVALID', 'Every representation basis must record which party asserted it.');
  }
}

/**
 * Whether an Authority Graph delegation actually corroborates a claimed
 * representation.
 *
 * This is the provenance check, and it is the reason the
 * `authority-graph-delegation` basis is evidence rather than decoration. A
 * grant corroborates only when it is live, in the stated trust domain,
 * delegated *to* the representative, and held *for* the holder. A delegation
 * that originated from some third party therefore cannot become evidence that
 * this representative may act for this holder, however broad that delegation's
 * actions and resource scopes happen to be.
 *
 * Returned rather than thrown, because the same predicate is used at creation
 * (where a failure is a refusal to write) and at evaluation (where a failure
 * is a coverage verdict, not an exception).
 */
export function delegationCorroborates(
  record: GovernedRepresentationDelegationRecord | undefined,
  expected: { readonly representativeRef: string; readonly holderRef: string; readonly trustDomainId: string },
): boolean {
  if (record === undefined) return false;
  if (record.status !== 'active') return false;
  if (record.trustDomainId !== expected.trustDomainId) return false;
  if (record.delegateActorId !== expected.representativeRef) return false;
  return record.principalActorId === expected.holderRef;
}

// ---------------------------------------------------------------------------
// Redelegation containment.
// ---------------------------------------------------------------------------

/**
 * Refuses a redelegation that is wider than its parent on any dimension.
 *
 * Delegates entirely to the pure `governedRepresentativeAuthorityContainmentBreach`,
 * which checks all seven at once. Splitting the check across call sites is
 * exactly how six of seven get verified and the seventh gets forgotten, so
 * this module offers one entry point and no per-dimension helpers.
 */
export function assertRedelegationContained(
  parent: GovernedRepresentativeAuthority,
  child: {
    readonly holderRef: string;
    readonly resourceKind: string;
    readonly resourceId: string;
    readonly governedRights: readonly GovernedRightType[];
    readonly actions: readonly string[];
    readonly scopeLimit: GovernedRepresentativeScopeLimit;
    readonly effectiveFrom: string;
    readonly expiresAt?: string;
  },
): void {
  if (!parent.canRedelegate) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_BASIS_INVALID',
      `Representation '${parent.id}' may not be redelegated.`,
      { parentId: parent.id },
    );
  }
  const breach = governedRepresentativeAuthorityContainmentBreach(parent, child, governedRightsScopeWithin);
  if (breach !== null) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_SCOPE_EXPANSION',
      `A redelegated representation may not broaden its parent; '${breach.dimension}' exceeds representation '${parent.id}'.`,
      { parentId: parent.id, dimension: breach.dimension, breach },
    );
  }
}

// ---------------------------------------------------------------------------
// Integrity. `computeDigest` is the Governance Store's canonical primitive
// (sha256 over canonical JSON), reused rather than re-implemented — exactly as
// `lifecycle.ts` reuses it for positions and transitions.
//
// Governance *Reference* Integrity is deliberately not reused here for the
// same reason it is not reused there: that mechanism chains references
// belonging to one governance evaluation, and a representation belongs to a
// tenant's governance configuration rather than to any single evaluation.
// There is also no digest *chain* here, unlike the transition log: a
// representation is current-state configuration, not an append-only history,
// and chaining unrelated grants would assert an ordering nothing relies on.
// ---------------------------------------------------------------------------

/** The exact bytes a representation's digest covers. Every field that could be tampered with to widen who may act for whom, or how much, is in here; the digest itself obviously is not. */
export function projectRepresentationForDigest(
  representation: Omit<GovernedRepresentativeAuthority, 'digest'>,
): Readonly<Record<string, unknown>> {
  return {
    id: representation.id,
    tenantId: representation.tenantId,
    holderRef: representation.holderRef,
    representativeRef: representation.representativeRef,
    resourceKind: representation.resourceKind,
    resourceId: representation.resourceId,
    governedRights: [...representation.governedRights],
    scopeLimit:
      representation.scopeLimit.kind === 'bounded'
        ? { kind: 'bounded', maximum: serializeGovernedRightsScope(representation.scopeLimit.maximum) }
        : { kind: 'unbounded' },
    actions: [...representation.actions],
    effectiveFrom: representation.effectiveFrom,
    ...(representation.expiresAt !== undefined ? { expiresAt: representation.expiresAt } : {}),
    canRedelegate: representation.canRedelegate,
    delegationDepth: representation.delegationDepth,
    ...(representation.parentRepresentativeAuthorityId !== undefined
      ? { parentRepresentativeAuthorityId: representation.parentRepresentativeAuthorityId }
      : {}),
    basis: representation.basis,
    ...(representation.revokedAt !== undefined ? { revokedAt: representation.revokedAt } : {}),
    createdAt: representation.createdAt,
    updatedAt: representation.updatedAt,
    ...(representation.correlationId !== undefined ? { correlationId: representation.correlationId } : {}),
  };
}

export function computeRepresentationDigest(representation: Omit<GovernedRepresentativeAuthority, 'digest'>): string {
  return computeDigest(projectRepresentationForDigest(representation));
}

/**
 * Recomputes a representation's digest on read and refuses a mismatch.
 *
 * Fails closed: a binding whose stored bytes changed after commit is never
 * reconstructed into a recognized right to spend somebody else's authority.
 * A tampered `holderRef` is the case this exists for.
 */
export function assertRepresentationIntegrity(representation: GovernedRepresentativeAuthority): GovernedRepresentativeAuthority {
  const { digest: _digest, ...rest } = representation;
  if (computeRepresentationDigest(rest) !== representation.digest) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_RECORD_CORRUPTED',
      `Governed representation '${representation.id}' does not match its stored digest; refusing to recognize representative authority from it.`,
      { representativeAuthorityId: representation.id },
    );
  }
  return representation;
}

/**
 * A representation's id.
 *
 * Derived from the tuple that identifies the grant rather than generated, so
 * the in-memory and SQLite stores agree on it without sharing a counter, and
 * so a replayed grant is nameable. The idempotency key participates when one
 * is supplied; when none is, a monotonic ordinal keeps two genuinely distinct
 * grants between the same parties over the same resource from colliding.
 */
export function deriveRepresentationId(key: {
  readonly tenantId: string;
  readonly holderRef: string;
  readonly representativeRef: string;
  readonly resourceKind: string;
  readonly resourceId: string;
  readonly discriminator: string;
}): string {
  const parts = [key.tenantId, key.holderRef, key.representativeRef, key.resourceKind, key.resourceId, key.discriminator];
  const canonical = parts.map((part) => `${part.length}:${part}`).join('|');
  return `governed-representation-${computeDigest({ key: canonical }).slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

/** The fields a replayed grant must match. A key reused with materially different terms is a conflict, never a silent reinterpretation of what was authorized. */
export function assertRepresentationReplayMatches(existing: GovernedRepresentativeAuthority, input: Readonly<Record<string, unknown>>): void {
  const stored = {
    holderRef: existing.holderRef,
    representativeRef: existing.representativeRef,
    resourceKind: existing.resourceKind,
    resourceId: existing.resourceId,
    governedRights: [...existing.governedRights].sort(),
    actions: [...existing.actions].sort(),
    scopeLimit: existing.scopeLimit.kind === 'bounded' ? serializeGovernedRightsScope(existing.scopeLimit.maximum) : 'unbounded',
    effectiveFrom: existing.effectiveFrom,
    expiresAt: existing.expiresAt ?? null,
  };
  if (computeDigest(stored) !== computeDigest(input)) {
    throw new AuthorityGovernanceError(
      'GOVERNED_REPRESENTATION_CONFLICT',
      `Representation '${existing.id}' was already granted under this idempotency key with materially different terms.`,
      { representativeAuthorityId: existing.id },
    );
  }
}

/** The projection `assertRepresentationReplayMatches` compares against, built from an input rather than a stored row. Kept beside it so the two can never drift into comparing different field sets. */
export function projectRepresentationInputForReplay(input: {
  readonly holderRef: string;
  readonly representativeRef: string;
  readonly resourceKind: string;
  readonly resourceId: string;
  readonly governedRights: readonly GovernedRightType[];
  readonly actions: readonly string[];
  readonly scopeLimit: GovernedRepresentativeScopeLimit;
  readonly effectiveFrom: string;
  readonly expiresAt?: string;
}): Readonly<Record<string, unknown>> {
  return {
    holderRef: input.holderRef,
    representativeRef: input.representativeRef,
    resourceKind: input.resourceKind,
    resourceId: input.resourceId,
    governedRights: [...input.governedRights].sort(),
    actions: [...input.actions].sort(),
    scopeLimit: input.scopeLimit.kind === 'bounded' ? serializeGovernedRightsScope(input.scopeLimit.maximum) : 'unbounded',
    effectiveFrom: input.effectiveFrom,
    expiresAt: input.expiresAt ?? null,
  };
}
