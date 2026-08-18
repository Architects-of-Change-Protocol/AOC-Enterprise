/**
 * Transfer Governance Runtime — the `TRANSFER` governed action.
 *
 * Deliberately no barrel export from `../index.js`, for the same reason the
 * Access Governance, Tokenization Governance, Collateralization Governance and
 * License Governance Runtimes have none: its canonical dependency
 * (`@aoc-enterprise/transfer-mandate`, itself depending on
 * `@aoc-enterprise/resource-envelope`) is not a declared runtime dependency of
 * the published `@aoc-enterprise/runtime` package (see
 * `scripts/validate-publishability.mjs`'s `bundledWorkspacePackages`). Import
 * directly from `./transfer-governance/index.js` within this monorepo;
 * publishing it on the package's public surface is follow-up work.
 */

export type {
  IssueTransferMandateInput,
  RecordTransferExecutionInput,
  RecordTransferLifecycleInput,
  RevokeTransferMandateInput,
  TransferEvidenceLineage,
  TransferExecutionRecord,
  TransferGovernanceContext,
  TransferLifecycleRecord,
  TransferMandateRecord,
  TransferMandateRevocationRecord,
  TransferMandateStatus,
  TransferMandateStoreHealth,
  TransferRequestOutcome,
  TransferRevokeOutcome,
} from './contracts.js';

export { TransferGovernanceError, isTransferGovernanceError } from './errors.js';
export type { TransferGovernanceErrorCode } from './errors.js';

export {
  assertNoTransferScopeEscalation,
  assertTransferActive,
  assertTransferExerciseAuthorized,
  assertTransferRevocable,
  nextTransferredScope,
  toCanonicalTransferMandate,
} from './lifecycle.js';
export type { TransferExerciseProposal } from './lifecycle.js';

export type { TransferMandateStore } from './mandate-store.js';
export {
  canAccessTransferOrganization,
  isStrictUtcTransferTimestamp,
  requireStrictUtcTransferTimestamp,
  requireTransferAccessToOrganization,
  requireTransferTenantScope,
} from './mandate-store.js';

export { TRANSFER_MANDATE_STORE_SCHEMA_VERSION, createInMemoryTransferMandateStore } from './in-memory-mandate-store.js';
export type { CreateInMemoryTransferMandateStoreOptions } from './in-memory-mandate-store.js';

export { createSqliteTransferMandateStore } from './sqlite-mandate-store.js';
export type { CreateSqliteTransferMandateStoreOptions } from './sqlite-mandate-store.js';

export { createTransferGovernanceService } from './service.js';
export type { TransferAuthorityPort } from './service.js';
export type {
  RecordTransferExecutionRequest,
  RecordTransferLifecycleRequest,
  RevokeTransferMandateRequest,
  SubmitTransferRequestInput,
  TransferGovernanceService,
  TransferGovernanceServiceDependencies,
  TransferKernelPort,
} from './service.js';
