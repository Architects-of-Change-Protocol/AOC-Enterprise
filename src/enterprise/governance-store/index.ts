/**
 * AOC Enterprise Governance Store v1 — the append-oriented, integrity-
 * verifiable, reconstructable durable record of every governance evaluation.
 * See `docs/enterprise/AOC_ENTERPRISE_GOVERNANCE_STORE.md`.
 */

export { AOC_CANONICALIZATION_VERSION, canonicalSerialize, CanonicalSerializationError } from './canonical-json.js';
export { computeDigest, isWellFormedDigest, GOVERNANCE_DIGEST_ALGORITHM } from './digest.js';
export { redactSensitiveValues, isSensitiveKey, DEFAULT_SENSITIVE_KEY_TERMS, GOVERNANCE_REDACTED_VALUE } from './redaction.js';

export { GovernanceStoreError, isGovernanceStoreError } from './errors.js';
export type { GovernanceStoreErrorCode, GovernanceIdempotencyConflictKind } from './errors.js';

export {
  AOC_GOVERNANCE_STORE_VERSION,
  GOVERNANCE_STORE_SCHEMA_VERSION,
  GOVERNANCE_STORE_CONTRACT_IDS,
  GOVERNANCE_MIGRATION_SOURCE_PR_002,
  GOVERNANCE_REFERENCE_TYPES,
  isCanonicalGovernanceReferenceType,
  toGovernanceReplayMetadata,
} from './contracts.js';
export type {
  GovernanceRecord,
  GovernanceRequestRecord,
  GovernanceEvaluationRecord,
  GovernanceTraceRecord,
  GovernanceReasonRecord,
  GovernanceEventRecord,
  GovernanceEventAggregateType,
  GovernanceModuleSnapshot,
  GovernanceProviderSnapshot,
  GovernanceRecordMetadata,
  GovernanceIntegrityMetadata,
  GovernanceReferenceRecord,
  GovernanceReferenceType,
  GovernanceCorrectionRecord,
  GovernanceReplayMetadata,
  GovernanceStoreAccessContext,
  GovernanceIdempotencyContext,
  GovernanceIdempotencyRecord,
  GovernanceIdempotencyProbe,
  GovernanceIdempotencyResolution,
  GovernanceEnterpriseContext,
  AppendGovernanceEvaluationInput,
  AppendGovernanceEvaluationResult,
  GovernanceStoreQuery,
  GovernanceStoreQueryResult,
  GovernanceRecordSummary,
  GovernanceIntegrityFailure,
  GovernanceRecordVerificationResult,
  GovernanceRecordLoadResult,
  GovernanceStoreHealth,
} from './contracts.js';

export type {
  GovernanceStore,
  EnterpriseEventRecord,
  EnterpriseVersionRecord,
  GovernanceDecisionTraceRecord,
  PersistEvaluationInput,
  PersistEvaluationResult,
  PersistEvaluationOutcome,
} from './governance-store.js';

export {
  buildGovernanceAggregate,
  computeGovernanceRequestPayloadDigest,
  projectRequestPayload,
  projectResultPayload,
  computeAggregateDigest,
  DEFAULT_GOVERNANCE_STORE_LIMITS,
  validateGovernanceStoreLimits,
} from './projection.js';
export type { GovernanceStoreLimits, GovernanceProjectionDependencies, GovernanceAggregate } from './projection.js';

export { verifyGovernanceRecordIntegrity } from './verification.js';
export { toKernelTrace, toKernelEvaluationResult } from './store-common.js';

export { createInMemoryGovernanceStore } from './in-memory-governance-store.js';
export type { CreateGovernanceStoreOptions } from './in-memory-governance-store.js';
export { createSqliteGovernanceStore } from './sqlite-governance-store.js';
export type { CreateSqliteGovernanceStoreOptions } from './sqlite-governance-store.js';
