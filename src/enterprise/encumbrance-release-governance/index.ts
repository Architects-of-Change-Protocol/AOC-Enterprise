/**
 * Encumbrance Release Governance Runtime — the `RELEASE_ENCUMBRANCE` governed
 * action, and the fifth member of Soberanía Enterprise's canonical action set.
 *
 * ```
 * TOKENIZE             authorize creating token representations of governed rights
 * COLLATERALIZE        authorize subjecting governed rights to an external collateral arrangement
 * LICENSE              authorize permitted uses of governed rights
 * TRANSFER             authorize moving governed rights between holders
 * RELEASE_ENCUMBRANCE  authorize ending a persistent constraint COLLATERALIZE left behind
 * ```
 *
 * It is here rather than inside `../collateralization-governance/` because what
 * it governs is a `GovernedAuthorityEncumbrance`, not a collateral arrangement.
 * Today every such constraint happens to come from `COLLATERALIZE`, and a
 * deployment that later classifies another action as encumbering gets this
 * lifecycle unchanged rather than a second copy of it inside that action's
 * module.
 *
 * Deliberately no barrel export from `../index.js`, for the same reason the
 * Access, Tokenization, Collateralization, License and Transfer Governance
 * Runtimes have none: their canonical dependencies are not declared runtime
 * dependencies of the published `@aoc-enterprise/runtime` package (see
 * `scripts/validate-publishability.mjs`). Import directly from
 * `./encumbrance-release-governance/index.js` within this monorepo.
 *
 * See `docs/enterprise/AOC_GOVERNED_ENCUMBRANCE_RELEASE.md` and
 * `docs/architecture/ADR-GOVERNED-ENCUMBRANCE-RELEASE.md`.
 */

export {
  ENTERPRISE_ENCUMBRANCE_RELEASE_SCHEMA_VERSION,
  ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY,
} from './contracts.js';
export type {
  EncumbranceReleaseEvidenceLineage,
  EncumbranceReleaseExecutionOutcomeKind,
  EncumbranceReleaseExecutionRecord,
  EncumbranceReleaseGovernanceContext,
  EncumbranceReleaseMandateRecord,
  EncumbranceReleaseMandateRevocationRecord,
  EncumbranceReleaseMandateStatus,
  EncumbranceReleaseMandateStoreHealth,
  EncumbranceReleaseResourceRef,
  EncumbranceReleaseRevokeOutcome,
  EnterpriseReleaseEncumbranceCapability,
  IssueEncumbranceReleaseMandateInput,
  RecordEncumbranceReleaseExecutionInput,
  RevokeEncumbranceReleaseMandateInput,
} from './contracts.js';

export { EncumbranceReleaseGovernanceError, isEncumbranceReleaseGovernanceError } from './errors.js';
export type { EncumbranceReleaseGovernanceErrorCode } from './errors.js';

export {
  assertEncumbranceActive,
  assertEncumbranceMatchesTarget,
  assertEncumbranceReleaseMandateExecutable,
  deriveEncumbranceReleaseIdempotencyKey,
  encumbranceReleaseResourceScope,
} from './lifecycle.js';

export {
  createFailingEncumbranceReleaseExecutorPort,
  createInMemoryEncumbranceReleaseExecutorPort,
  createIndeterminateEncumbranceReleaseExecutorPort,
  createUnavailableEncumbranceReleaseExecutorPort,
} from './executor-port.js';
export type {
  EncumbranceReleaseExecutionOutcome,
  EncumbranceReleaseExecutionRequest,
  EncumbranceReleaseExecutorPort,
  InMemoryEncumbranceReleaseExecutorOptions,
  InMemoryEncumbranceReleaseExecutorPort,
} from './executor-port.js';

export type { EncumbranceReleaseMandateStore } from './mandate-store.js';
export {
  canAccessEncumbranceReleaseOrganization,
  isStrictUtcEncumbranceReleaseTimestamp,
  requireEncumbranceReleaseAccessToOrganization,
  requireEncumbranceReleaseTenantScope,
  requireStrictUtcEncumbranceReleaseTimestamp,
} from './mandate-store.js';

export {
  ENCUMBRANCE_RELEASE_MANDATE_STORE_SCHEMA_VERSION,
  createInMemoryEncumbranceReleaseMandateStore,
} from './in-memory-mandate-store.js';
export type { CreateInMemoryEncumbranceReleaseMandateStoreOptions } from './in-memory-mandate-store.js';

export { createSqliteEncumbranceReleaseMandateStore } from './sqlite-mandate-store.js';
export type { CreateSqliteEncumbranceReleaseMandateStoreOptions } from './sqlite-mandate-store.js';

export { createEncumbranceReleaseGovernanceService } from './service.js';
export type {
  EncumbranceReleaseAuthorityPort,
  EncumbranceReleaseExecutionOutcomeResult,
  EncumbranceReleaseGovernanceService,
  EncumbranceReleaseGovernanceServiceDependencies,
  EncumbranceReleaseKernelPort,
  EncumbranceReleaseRequestOutcome,
  ExecuteEncumbranceReleaseRequest,
  RevokeEncumbranceReleaseMandateRequest,
  SubmitEncumbranceReleaseRequestInput,
} from './service.js';
