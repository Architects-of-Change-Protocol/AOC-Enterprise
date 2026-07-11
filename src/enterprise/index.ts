/**
 * Public surface of the AOC Enterprise Host: the production HTTP service
 * that hosts `AocKernel` (`../kernel`). Exposes composition, hosting, and
 * contract types only -- internal orchestration/persistence wiring is
 * reachable for advanced embedding (e.g. a Next.js route handler that
 * wants `createEnterprise()` without `node:http`), but nothing here
 * introduces governance logic; every decision still comes from
 * `AocKernel.evaluate()`.
 *
 * This module replaces the prior `kernel-host` package (see
 * `docs/enterprise/KERNEL_HOST_TO_ENTERPRISE_MIGRATION.md`); a compatibility
 * re-export lives at `@aoc-enterprise/runtime/kernel-host` for one
 * transition period.
 */

export { AOC_ENTERPRISE_HOST_VERSION } from './version.js';

export { loadEnterpriseConfiguration, computeConfigurationChecksum } from './configuration/enterprise-configuration.js';
export type {
  EnterpriseConfiguration,
  EnterpriseEnvironment,
  EnterprisePersistenceProviderKind,
  EnterpriseFeatureFlags,
  EnterpriseApiKey,
} from './configuration/enterprise-configuration.js';

export { createEnterpriseTelemetry } from './telemetry/enterprise-telemetry.js';
export type { EnterpriseTelemetry, EnterpriseMetricsSnapshot } from './telemetry/enterprise-telemetry.js';
export { createEnterpriseLogger } from './telemetry/enterprise-logger.js';
export type { EnterpriseLogger, EnterpriseLogContext, EnterpriseLogLevel, EnterpriseLoggerSink } from './telemetry/enterprise-logger.js';

export { createInProcessEventPublisher } from './events/enterprise-events.js';
export type { EnterpriseEvent, EnterpriseEventType, EnterpriseEventPublisher, GovernanceEvaluationRequestedEvent, GovernanceEvaluationCompletedEvent } from './events/enterprise-events.js';

export { createDefaultKernelProviders } from './providers/kernel-provider-composition.js';
export type { KernelProviderSet, KernelWorldHandles } from './providers/kernel-provider-composition.js';

// -- AOC Enterprise Governance Store v1 (PR-004) ----------------------------

export { createInMemoryGovernanceStore } from './governance-store/in-memory-governance-store.js';
export type { CreateGovernanceStoreOptions } from './governance-store/in-memory-governance-store.js';
export { createSqliteGovernanceStore } from './governance-store/sqlite-governance-store.js';
export type { CreateSqliteGovernanceStoreOptions } from './governance-store/sqlite-governance-store.js';
export type {
  GovernanceStore,
  GovernanceDecisionTraceRecord,
  EnterpriseEventRecord,
  EnterpriseVersionRecord,
  PersistEvaluationInput,
  PersistEvaluationResult,
  PersistEvaluationOutcome,
} from './governance-store/governance-store.js';
export {
  AOC_GOVERNANCE_STORE_VERSION,
  GOVERNANCE_STORE_SCHEMA_VERSION,
  GOVERNANCE_STORE_CONTRACT_IDS,
  GOVERNANCE_MIGRATION_SOURCE_PR_002,
  toGovernanceReplayMetadata,
} from './governance-store/contracts.js';
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
} from './governance-store/contracts.js';
export { GovernanceStoreError, isGovernanceStoreError } from './governance-store/errors.js';
export type { GovernanceStoreErrorCode, GovernanceIdempotencyConflictKind } from './governance-store/errors.js';
export { AOC_CANONICALIZATION_VERSION, canonicalSerialize, CanonicalSerializationError } from './governance-store/canonical-json.js';
export { computeDigest, isWellFormedDigest, GOVERNANCE_DIGEST_ALGORITHM } from './governance-store/digest.js';
export { redactSensitiveValues, isSensitiveKey, DEFAULT_SENSITIVE_KEY_TERMS, GOVERNANCE_REDACTED_VALUE } from './governance-store/redaction.js';
export { DEFAULT_GOVERNANCE_STORE_LIMITS, computeGovernanceRequestPayloadDigest } from './governance-store/projection.js';
export type { GovernanceStoreLimits } from './governance-store/projection.js';
export { verifyGovernanceRecordIntegrity } from './governance-store/verification.js';
export { toKernelTrace, toKernelEvaluationResult } from './governance-store/store-common.js';
export { createGovernanceReadService, resolveGovernanceAccessContext } from './orchestration/governance-read-service.js';
export type { GovernanceReadService } from './orchestration/governance-read-service.js';

// -- AOC Enterprise Evidence Bundle v1 (PR-005) -----------------------------

export {
  AOC_EVIDENCE_BUNDLE_VERSION,
  EVIDENCE_BUNDLE_SCHEMA_VERSION,
  EVIDENCE_PROJECTION_ENGINE_VERSION,
  EVIDENCE_CONTRACT_IDS,
  EVIDENCE_FIELD_KEYS,
} from './evidence/contracts.js';
export type {
  DisclosureLevel,
  DisclosurePolicy,
  EvidenceFieldKey,
  EvidenceDisclosureMetadata,
  EvidenceSource,
  EvidenceSubject,
  EvidenceSubjectType,
  EvidenceTraceStep,
  EvidenceEventSummary,
  EvidenceContent,
  EvidenceIntegrityMetadata,
  EvidenceProvenance,
  EvidenceReference,
  EvidenceReferenceType,
  EvidenceBundle,
  EvidenceBundleState,
  EvidenceBundleRecord,
  EvidenceIntegrityFailure,
  EvidenceVerificationResult,
} from './evidence/contracts.js';
export { EvidenceError, isEvidenceError } from './evidence/errors.js';
export type { EvidenceErrorCode } from './evidence/errors.js';
export {
  FULL_DISCLOSURE_POLICY,
  AUDITOR_DISCLOSURE_POLICY,
  PARTNER_DISCLOSURE_POLICY,
  CUSTOMER_DISCLOSURE_POLICY,
  PUBLIC_DISCLOSURE_POLICY,
  getDisclosurePolicy,
  findDisclosurePolicyById,
  listDisclosurePolicies,
} from './evidence/disclosure-policies.js';
export { buildEvidenceBundle, EVIDENCE_DISCLOSURE_REDACTED_VALUE } from './evidence/projector.js';
export type { EvidenceProjectionDependencies } from './evidence/projector.js';
export { verifyEvidenceBundle } from './evidence/verifier.js';
export { createInMemoryEvidenceStore } from './evidence/evidence-store.js';
export type { EvidenceStore, CreateEvidenceStoreOptions } from './evidence/evidence-store.js';
export { createEvidenceService } from './evidence/evidence-service.js';
export type { EvidenceService, EvidenceServiceDependencies, BuildEvidenceBundleInput } from './evidence/evidence-service.js';
export {
  validateEvidenceBuildRequestBody,
  validateEvidenceVerifyRequestBody,
  toEvidenceBundleResponseBody,
  toEvidenceVerifyResponseBody,
} from './api/evidence-contract.js';
export type { EvidenceBuildRequestBody, EvidenceBundleResponseBody, EvidenceVerifyRequestBody } from './api/evidence-contract.js';
export { mapEvidenceErrorToHttp } from './api/enterprise-http-errors.js';

// -- AOC Enterprise Agent Passport Runtime v1 (PR-006) ----------------------

export {
  AOC_AGENT_PASSPORT_RUNTIME_VERSION,
  AGENT_PASSPORT_SCHEMA_VERSION,
  AGENT_PASSPORT_CONTRACT_IDS,
  AGENT_PASSPORT_TERMINAL_STATUSES,
} from './passport/contracts.js';
export type {
  AgentPassportSubjectType,
  AgentPassportSubject,
  AgentPassportOrganizationBinding,
  AgentPassportStatus,
  AgentPassportLifecycle,
  AgentIdentityDescriptor,
  AgentReferenceStatus,
  AgentCapabilityReference,
  AgentAuthorityReference,
  AgentDelegationReference,
  PassportGovernanceReference,
  PassportEvidenceReference,
  AgentPassportProvenance,
  AgentPassportIntegrity,
  AgentPassport,
  AgentPassportEventType,
  AgentPassportEvent,
  AgentPassportClaim,
  AgentPassportHistorySummary,
  AgentPassportViewType,
  AgentPassportViewProvenance,
  AgentPassportViewIntegrity,
  AgentPassportView,
  AgentPassportVerificationMode,
  PassportVerificationFailure,
  AgentPassportVerificationResult,
  PassportAccessContext,
  AppendPassportEventInput,
  AppendPassportEventResult,
  AgentPassportLoadResult,
  AgentPassportStoreHealth,
  PassportIdempotencyContext,
  PassportIdempotencyProbe,
  PassportIdempotencyResolution,
} from './passport/contracts.js';
export { AgentPassportError, isAgentPassportError } from './passport/errors.js';
export type { AgentPassportErrorCode } from './passport/errors.js';
export { applyLifecycleTransition, isLifecycleEventType, isTerminalStatus } from './passport/lifecycle.js';
export { verifyEventChain } from './passport/events.js';
export { reconstructAgentPassportFromEvents, computePassportHistorySummary } from './passport/reconstruction.js';
export type { AgentPassportStore } from './passport/passport-store.js';
export { createInMemoryPassportStore } from './passport/in-memory-passport-store.js';
export type { CreateInMemoryPassportStoreOptions } from './passport/in-memory-passport-store.js';
export { createSqlitePassportStore } from './passport/sqlite-passport-store.js';
export type { CreateSqlitePassportStoreOptions } from './passport/sqlite-passport-store.js';
export { verifyAgentPassport } from './passport/verification.js';
export type { PassportReferenceCheckers } from './passport/verification.js';
export { AGENT_PASSPORT_VIEW_TYPES, buildAgentPassportView, isAgentPassportViewType } from './passport/disclosure.js';
export { createAgentPassportService } from './passport/service.js';
export type {
  AgentPassportService,
  AgentPassportServiceDependencies,
  IssueAgentPassportInput,
  IssueAgentPassportResult,
  RetireAgentPassportInput,
  RevokeAgentPassportInput,
  SuspendAgentPassportInput,
} from './passport/service.js';
export { createAgentPassportModule, AGENT_PASSPORT_MODULE_ID } from './modules/passport-module.js';
export { mapAgentPassportErrorToHttp } from './api/enterprise-http-errors.js';

export { computeEnterpriseHealth } from './health/health-check.js';
export type { EnterpriseHealthReport, EnterpriseHealthState, EnterpriseHealthDependencies } from './health/health-check.js';

export {
  validateGovernanceEvaluateRequestBody,
  toKernelEvaluationRequest,
  toKernelEvaluationOptions,
  toGovernanceEvaluateResponseBody,
  mapDecisionStatusToHttpStatus,
} from './api/governance-evaluate-contract.js';
export type { GovernanceEvaluateRequestBody, GovernanceEvaluateResponseBody } from './api/governance-evaluate-contract.js';
export { EnterpriseHttpError, EnterpriseHttpErrors, mapGovernanceStoreErrorToHttp } from './api/enterprise-http-errors.js';
export type { EnterpriseHttpErrorCode } from './api/enterprise-http-errors.js';

export { evaluateGovernanceRequest } from './orchestration/evaluate-governance-request.js';
export type { EvaluateGovernanceRequestInput, EvaluateGovernanceRequestDependencies, EnterpriseEvaluationResponse } from './orchestration/evaluate-governance-request.js';

export { createEnterprise, createDefaultEnterprise } from './composition/composition-root.js';
export type { AocEnterprise, CreateEnterpriseOptions, EnterpriseEvaluationRequest, EnterpriseRequestContext } from './composition/composition-root.js';

export { createEnterpriseRequestListener } from './adapters/node-http-adapter.js';

export { createEnterpriseServer } from './host/enterprise-server.js';
export type { EnterpriseServer } from './host/enterprise-server.js';

// -- AOC Enterprise Module Lifecycle & Registry (PR-003) --------------------

export type {
  EnterpriseModuleId,
  EnterpriseModuleState,
  EnterpriseLifecycleState,
  EnterpriseHealthStatus,
  EnterpriseModuleHealth,
  EnterpriseModuleDependency,
  EnterpriseModuleDescriptor,
  EnterpriseModuleRegistryView,
  EnterpriseModuleContext,
  EnterpriseModule,
  EnterpriseModuleSnapshot,
} from './modules/enterprise-module.js';
export { createKernelModule, KERNEL_MODULE_ID } from './modules/kernel-module.js';
export { createProvidersModule, PROVIDERS_MODULE_ID } from './modules/providers-module.js';
export { createGovernanceStoreModule, createPersistenceModule, GOVERNANCE_STORE_MODULE_ID, PERSISTENCE_MODULE_ID } from './modules/governance-store-module.js';
export { createEventsModule, EVENTS_MODULE_ID } from './modules/events-module.js';
export { createTelemetryModule, TELEMETRY_MODULE_ID } from './modules/telemetry-module.js';

export { createEnterpriseModuleRegistry } from './registry/enterprise-module-registry.js';
export type { EnterpriseModuleRegistry, EnterpriseModuleRegistration, EnterpriseDependencyValidationResult } from './registry/enterprise-module-registry.js';
export { isVersionCompatible, resolveTopologicalOrder } from './registry/dependency-graph.js';

export { createEnterpriseLifecycleController } from './lifecycle/enterprise-lifecycle-controller.js';
export type {
  EnterpriseLifecycleController,
  EnterpriseLifecycleControllerDependencies,
  EnterpriseLifecycleSnapshot,
  EnterpriseModuleHealthEntry,
} from './lifecycle/enterprise-lifecycle-controller.js';
export { isValidModuleTransition, isValidHostTransition } from './lifecycle/lifecycle-state.js';
export {
  EnterpriseLifecycleError,
  EnterpriseModuleRegistrationError,
  EnterpriseModuleDependencyError,
  EnterpriseModuleCycleError,
  EnterpriseModuleInitializationError,
  EnterpriseModuleStateError,
  EnterpriseModuleShutdownError,
  EnterpriseNotReadyError,
} from './lifecycle/lifecycle-errors.js';
export type { EnterpriseModuleShutdownFailure } from './lifecycle/lifecycle-errors.js';
export type { EnterpriseLifecycleEvent, EnterpriseLifecycleEventType } from './lifecycle/lifecycle-events.js';

export type { EnterpriseLifecycleConfiguration } from './configuration/enterprise-configuration.js';
