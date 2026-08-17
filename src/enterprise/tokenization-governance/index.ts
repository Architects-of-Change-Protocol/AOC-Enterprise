/**
 * Tokenization Governance Runtime — the `TOKENIZE` governed capability.
 *
 * Deliberately no barrel export from `../index.js`, for the same reason
 * the Access Governance Runtime has none: its canonical dependency
 * (`@aoc-enterprise/tokenization-mandate`, itself depending on
 * `@aoc-enterprise/resource-envelope`) is not a declared runtime dependency
 * of the published `@aoc-enterprise/runtime` package (see
 * `scripts/validate-publishability.mjs`'s `bundledWorkspacePackages`).
 * Import directly from `./tokenization-governance/index.js` within this
 * monorepo; publishing it on the package's public surface is follow-up work.
 */

export type {
  IssueTokenizationMandateInput,
  RecordTokenizationExecutionInput,
  RevokeTokenizationMandateInput,
  TokenizationEvidenceLineage,
  TokenizationExecutionRecord,
  TokenizationGovernanceContext,
  TokenizationMandateRecord,
  TokenizationMandateRevocationRecord,
  TokenizationMandateStatus,
  TokenizationMandateStoreHealth,
  TokenizationRequestOutcome,
  TokenizationRevokeOutcome,
} from './contracts.js';

export { TokenizationGovernanceError, isTokenizationGovernanceError } from './errors.js';
export type { TokenizationGovernanceErrorCode } from './errors.js';

export { assertActive, assertExerciseAuthorized, assertNoScopeEscalation, assertRevocable, toCanonicalMandate } from './lifecycle.js';
export type { TokenizationExerciseProposal } from './lifecycle.js';

export type { TokenizationMandateStore } from './mandate-store.js';
export {
  canAccessTokenizationOrganization,
  isStrictUtcTokenizationTimestamp,
  requireStrictUtcTokenizationTimestamp,
  requireTokenizationAccessToOrganization,
  requireTokenizationTenantScope,
} from './mandate-store.js';

export { TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION, createInMemoryTokenizationMandateStore } from './in-memory-mandate-store.js';
export type { CreateInMemoryTokenizationMandateStoreOptions } from './in-memory-mandate-store.js';

export { createSqliteTokenizationMandateStore } from './sqlite-mandate-store.js';
export type { CreateSqliteTokenizationMandateStoreOptions } from './sqlite-mandate-store.js';

export { createTokenizationGovernanceService } from './service.js';
export type {
  RecordTokenizationExecutionRequest,
  RevokeTokenizationMandateRequest,
  SubmitTokenizationRequestInput,
  TokenizationGovernanceService,
  TokenizationGovernanceServiceDependencies,
  TokenizationKernelPort,
} from './service.js';
