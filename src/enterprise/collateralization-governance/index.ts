/**
 * Collateralization Governance Runtime — the `COLLATERALIZE` governed action.
 *
 * Deliberately no barrel export from `../index.js`, for the same reason the
 * Access Governance and Tokenization Governance Runtimes have none: its
 * canonical dependency (`@aoc-enterprise/collateralization-mandate`, itself
 * depending on `@aoc-enterprise/resource-envelope`) is not a declared runtime
 * dependency of the published `@aoc-enterprise/runtime` package (see
 * `scripts/validate-publishability.mjs`'s `bundledWorkspacePackages`).
 * Import directly from `./collateralization-governance/index.js` within this
 * monorepo; publishing it on the package's public surface is follow-up work.
 */

export type {
  CollateralizationEvidenceLineage,
  CollateralizationExecutionRecord,
  CollateralizationGovernanceContext,
  CollateralizationMandateRecord,
  CollateralizationMandateRevocationRecord,
  CollateralizationMandateStatus,
  CollateralizationMandateStoreHealth,
  CollateralizationReleaseRecord,
  CollateralizationRequestOutcome,
  CollateralizationRevokeOutcome,
  IssueCollateralizationMandateInput,
  RecordCollateralizationExecutionInput,
  RecordCollateralizationReleaseInput,
  RevokeCollateralizationMandateInput,
} from './contracts.js';

export { CollateralizationGovernanceError, isCollateralizationGovernanceError } from './errors.js';
export type { CollateralizationGovernanceErrorCode } from './errors.js';

export {
  assertCollateralExerciseAuthorized,
  assertCollateralizationActive,
  assertCollateralizationRevocable,
  assertNoCollateralScopeEscalation,
  nextCommittedCollateralScope,
  toCanonicalCollateralizationMandate,
} from './lifecycle.js';
export type { CollateralizationExerciseProposal } from './lifecycle.js';

export type { CollateralizationMandateStore } from './mandate-store.js';
export {
  canAccessCollateralizationOrganization,
  isStrictUtcCollateralizationTimestamp,
  requireCollateralizationAccessToOrganization,
  requireCollateralizationTenantScope,
  requireStrictUtcCollateralizationTimestamp,
} from './mandate-store.js';

export {
  COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION,
  createInMemoryCollateralizationMandateStore,
} from './in-memory-mandate-store.js';
export type { CreateInMemoryCollateralizationMandateStoreOptions } from './in-memory-mandate-store.js';

export { createSqliteCollateralizationMandateStore } from './sqlite-mandate-store.js';
export type { CreateSqliteCollateralizationMandateStoreOptions } from './sqlite-mandate-store.js';

export { createCollateralizationGovernanceService } from './service.js';
export type {
  CollateralizationGovernanceService,
  CollateralizationGovernanceServiceDependencies,
  CollateralizationKernelPort,
  RecordCollateralizationExecutionRequest,
  RecordCollateralizationReleaseRequest,
  RevokeCollateralizationMandateRequest,
  SubmitCollateralizationRequestInput,
} from './service.js';
