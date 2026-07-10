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

export { createInMemoryGovernanceStore } from './persistence/in-memory-governance-store.js';
export { createSqliteGovernanceStore } from './persistence/sqlite-governance-store.js';
export type {
  GovernanceStore,
  GovernanceRequestRecord,
  GovernanceEvaluationRecord,
  GovernanceTraceRecord,
  EnterpriseEventRecord,
  EnterpriseVersionRecord,
  PersistEvaluationInput,
  PersistEvaluationResult,
  PersistEvaluationOutcome,
} from './persistence/governance-store.js';

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
export { EnterpriseHttpError, EnterpriseHttpErrors } from './api/enterprise-http-errors.js';
export type { EnterpriseHttpErrorCode } from './api/enterprise-http-errors.js';

export { evaluateGovernanceRequest } from './orchestration/evaluate-governance-request.js';
export type { EvaluateGovernanceRequestInput, EvaluateGovernanceRequestDependencies, EnterpriseEvaluationResponse } from './orchestration/evaluate-governance-request.js';

export { createEnterprise, createDefaultEnterprise } from './composition/composition-root.js';
export type { AocEnterprise, CreateEnterpriseOptions, EnterpriseEvaluationRequest, EnterpriseRequestContext } from './composition/composition-root.js';

export { createEnterpriseRequestListener } from './adapters/node-http-adapter.js';

export { createEnterpriseServer } from './host/enterprise-server.js';
export type { EnterpriseServer } from './host/enterprise-server.js';
