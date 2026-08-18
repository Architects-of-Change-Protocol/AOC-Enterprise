/**
 * The Governed Authority Runtime: the right-scoped authority state AOC
 * Enterprise recognizes, the append-only transitions that change it, the
 * holder-bound representations that say who may exercise whose authority, and
 * the two resolvers that turn both into the facts the Kernel asks for.
 *
 * The two halves answer questions that must never be confused:
 *
 * ```
 * GovernedAuthorityStore        which party holds this governed right, how much of it stands
 *                               committed to a live authorization, and how much of it remains
 *                               persistently constrained by one that already executed?
 * GovernedRepresentationStore   which party may exercise that holder's authority?
 * ```
 *
 * Separate stores, separate resolvers, separate Kernel ports. A request where
 * the requester is not the holder needs an affirmative answer from both, and
 * neither can substitute for the other.
 *
 * See `docs/enterprise/AOC_GOVERNED_AUTHORITY.md`,
 * `docs/enterprise/AOC_GOVERNED_REPRESENTATIVE_AUTHORITY.md`,
 * `docs/enterprise/AOC_GOVERNED_AUTHORITY_RESERVATION.md`,
 * `docs/enterprise/AOC_GOVERNED_AUTHORITY_ENCUMBRANCE.md`,
 * `docs/architecture/ADR-GOVERNED-AUTHORITY-TRANSITION.md`,
 * `docs/architecture/ADR-GOVERNED-AUTHORITY-RESERVATION.md`,
 * `docs/architecture/ADR-GOVERNED-AUTHORITY-ENCUMBRANCE.md` and
 * `docs/architecture/ADR-HOLDER-BOUND-REPRESENTATIVE-AUTHORITY.md`.
 */
export { AuthorityGovernanceError, isAuthorityGovernanceError } from './errors.js';
export type { AuthorityGovernanceErrorCode } from './errors.js';

export type {
  AcquireGovernedAuthorityReservationInput,
  AcquireGovernedAuthorityReservationOutcome,
  ApplyGovernedAuthorityTransitionInput,
  ApplyGovernedAuthorityTransitionOutcome,
  AuthorityGovernanceContext,
  BootstrapGovernedAuthorityInput,
  GovernedAuthorityAvailabilityQuery,
  GovernedAuthorityProvenance,
  GovernedAuthorityReservationReleaseReason,
  GovernedAuthorityResourceRef,
  GovernedAuthorityStoreHealth,
  RecordGovernedAuthorityEncumbranceInput,
  RecordGovernedAuthorityEncumbranceOutcome,
  ReleaseGovernedAuthorityEncumbranceInput,
  ReleaseGovernedAuthorityReservationInput,
} from './contracts.js';

export {
  canAccessAuthorityOrganization,
  isStrictUtcAuthorityTimestamp,
  requireAuthorityAccessToOrganization,
  requireAuthorityTenantScope,
  requireStrictUtcAuthorityTimestamp,
} from './authority-store.js';
export type { GovernedAuthorityStore } from './authority-store.js';

export { assertTransitionChain, assertTransitionIntegrity, assertPositionIntegrity } from './lifecycle.js';

export {
  assertReservationIntegrity,
  computeAvailability,
  computeReservationDigest,
  governedActionCommitsAuthority,
  governedActionConservesAuthority,
  GOVERNED_AUTHORITY_CONSERVING_ACTIONS,
} from './reservation-lifecycle.js';

export {
  assertEncumbranceIntegrity,
  assertRemainingScopeCoversEncumbrances,
  computeCapacity,
  computeEncumbranceDigest,
  governedActionEncumbersAuthority,
  GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS,
} from './encumbrance-lifecycle.js';

export { createInMemoryGovernedAuthorityStore, GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION } from './in-memory-authority-store.js';
export type { CreateInMemoryGovernedAuthorityStoreOptions } from './in-memory-authority-store.js';

export { createSqliteGovernedAuthorityStore } from './sqlite-authority-store.js';
export type { CreateSqliteGovernedAuthorityStoreOptions } from './sqlite-authority-store.js';

export { createGovernedAuthorityResolver } from './resolver.js';
export type { CreateGovernedAuthorityResolverOptions, UnenrolledResourcePolicy } from './resolver.js';

// ---------------------------------------------------------------------------
// Holder-bound representative authority.
// ---------------------------------------------------------------------------

export type {
  GovernedRepresentationDelegationPort,
  GovernedRepresentationDelegationRecord,
  GovernedRepresentationStoreHealth,
  GrantRepresentativeAuthorityInput,
  GrantRepresentativeAuthorityOutcome,
} from './representation-contracts.js';

export type { GovernedRepresentationStore } from './representation-store.js';

export {
  assertRepresentationIntegrity,
  computeRepresentationDigest,
  delegationCorroborates,
} from './representation-lifecycle.js';

export { createInMemoryGovernedRepresentationStore, GOVERNED_REPRESENTATION_STORE_SCHEMA_VERSION } from './in-memory-representation-store.js';
export type { CreateInMemoryGovernedRepresentationStoreOptions } from './in-memory-representation-store.js';

export { createSqliteGovernedRepresentationStore } from './sqlite-representation-store.js';
export type { CreateSqliteGovernedRepresentationStoreOptions } from './sqlite-representation-store.js';

export { createGovernedRepresentationResolver } from './representation-resolver.js';
export type { CreateGovernedRepresentationResolverOptions } from './representation-resolver.js';
