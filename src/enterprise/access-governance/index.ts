export type {
  AccessGovernanceContext,
  AccessGrantProviderEnforcementResult,
  AccessGrantRecord,
  AccessGrantResource,
  AccessGrantRevocationRecord,
  AccessGrantStatus,
  AccessGrantStoreHealth,
  BeginRevocationInput,
  EffectiveRevocationMode,
  FinalizeRevocationEnforcementInput,
  IssueAccessGrantInput,
  ProviderActionResult,
  RecordProviderCredentialIssuanceInput,
  RevokeOutcome,
} from './contracts.js';
export { createPendingEnforcementResult } from './contracts.js';

export { AccessGovernanceError, isAccessGovernanceError } from './errors.js';
export type { AccessGovernanceErrorCode } from './errors.js';

export { assertActive, assertRevocable } from './lifecycle.js';

export type { AccessGrantStore } from './access-grant-store.js';
export {
  canAccessAccessGrantOrganization,
  isStrictUtcTimestamp,
  requireAccessGrantAccessToOrganization,
  requireAccessGrantTenantScope,
  requireStrictUtcTimestamp,
} from './access-grant-store.js';

export { ACCESS_GRANT_STORE_SCHEMA_VERSION, createInMemoryAccessGrantStore } from './in-memory-access-grant-store.js';
export type { CreateInMemoryAccessGrantStoreOptions } from './in-memory-access-grant-store.js';

export { createSqliteAccessGrantStore } from './sqlite-access-grant-store.js';
export type { CreateSqliteAccessGrantStoreOptions } from './sqlite-access-grant-store.js';

export { determineAndExecutePinataEnforcement, unknownProviderEnforcement } from './pinata-revocation-enforcement.js';
export type { DeterminePinataEnforcementInput } from './pinata-revocation-enforcement.js';

export { createAccessGrantService } from './service.js';
export type {
  AccessGrantService,
  AccessGrantServiceDependencies,
  IssueAccessGrantRequest,
  ProviderCredential,
  RequestProviderCredentialInput,
  RevokeAccessGrantRequest,
} from './service.js';

export { revokeGrantRequest } from './orchestration.js';
export type { RevokeGrantRequestDependencies, RevokeGrantRequestInput } from './orchestration.js';
