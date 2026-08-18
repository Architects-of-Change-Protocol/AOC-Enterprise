/**
 * The Governed Authority Runtime: the right-scoped authority state AOC
 * Enterprise recognizes, the append-only transitions that change it, and the
 * resolver that turns it into the one fact the Kernel asks for.
 *
 * See `docs/enterprise/AOC_GOVERNED_AUTHORITY.md` and
 * `docs/architecture/ADR-GOVERNED-AUTHORITY-TRANSITION.md`.
 */
export { AuthorityGovernanceError, isAuthorityGovernanceError } from './errors.js';
export type { AuthorityGovernanceErrorCode } from './errors.js';

export type {
  ApplyGovernedAuthorityTransitionInput,
  ApplyGovernedAuthorityTransitionOutcome,
  AuthorityGovernanceContext,
  BootstrapGovernedAuthorityInput,
  GovernedAuthorityProvenance,
  GovernedAuthorityResourceRef,
  GovernedAuthorityStoreHealth,
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

export { createInMemoryGovernedAuthorityStore, GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION } from './in-memory-authority-store.js';
export type { CreateInMemoryGovernedAuthorityStoreOptions } from './in-memory-authority-store.js';

export { createSqliteGovernedAuthorityStore } from './sqlite-authority-store.js';
export type { CreateSqliteGovernedAuthorityStoreOptions } from './sqlite-authority-store.js';

export { createGovernedAuthorityResolver } from './resolver.js';
export type { CreateGovernedAuthorityResolverOptions, UnenrolledResourcePolicy } from './resolver.js';
