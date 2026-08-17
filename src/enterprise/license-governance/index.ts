/**
 * License Governance Runtime — the `LICENSE` governed action.
 *
 * Deliberately no barrel export from `../index.js`, for the same reason the
 * Access Governance, Tokenization Governance and Collateralization Governance
 * Runtimes have none: its canonical dependency
 * (`@aoc-enterprise/license-mandate`, itself depending on
 * `@aoc-enterprise/resource-envelope`) is not a declared runtime dependency of
 * the published `@aoc-enterprise/runtime` package (see
 * `scripts/validate-publishability.mjs`'s `bundledWorkspacePackages`). Import
 * directly from `./license-governance/index.js` within this monorepo;
 * publishing it on the package's public surface is follow-up work.
 */

export type {
  IssueLicenseMandateInput,
  LicenseEvidenceLineage,
  LicenseExecutionRecord,
  LicenseGovernanceContext,
  LicenseLifecycleRecord,
  LicenseMandateRecord,
  LicenseMandateRevocationRecord,
  LicenseMandateStatus,
  LicenseMandateStoreHealth,
  LicenseRequestOutcome,
  LicenseRevokeOutcome,
  RecordLicenseExecutionInput,
  RecordLicenseLifecycleInput,
  RevokeLicenseMandateInput,
} from './contracts.js';

export { LicenseGovernanceError, isLicenseGovernanceError } from './errors.js';
export type { LicenseGovernanceErrorCode } from './errors.js';

export {
  assertLicenseActive,
  assertLicenseExerciseAuthorized,
  assertLicenseRevocable,
  assertNoLicensePermissionEscalation,
  toCanonicalLicenseMandate,
} from './lifecycle.js';
export type { LicenseExerciseProposal } from './lifecycle.js';

export type { LicenseMandateStore } from './mandate-store.js';
export {
  canAccessLicenseOrganization,
  isStrictUtcLicenseTimestamp,
  requireLicenseAccessToOrganization,
  requireLicenseTenantScope,
  requireStrictUtcLicenseTimestamp,
} from './mandate-store.js';

export { LICENSE_MANDATE_STORE_SCHEMA_VERSION, createInMemoryLicenseMandateStore } from './in-memory-mandate-store.js';
export type { CreateInMemoryLicenseMandateStoreOptions } from './in-memory-mandate-store.js';

export { createSqliteLicenseMandateStore } from './sqlite-mandate-store.js';
export type { CreateSqliteLicenseMandateStoreOptions } from './sqlite-mandate-store.js';

export { createLicenseGovernanceService } from './service.js';
export type {
  LicenseGovernanceService,
  LicenseGovernanceServiceDependencies,
  LicenseKernelPort,
  RecordLicenseExecutionRequest,
  RecordLicenseLifecycleRequest,
  RevokeLicenseMandateRequest,
  SubmitLicenseRequestInput,
} from './service.js';
