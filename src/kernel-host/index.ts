/**
 * Public surface of the Enterprise Kernel Runtime Host: the production HTTP
 * service that hosts `AocKernel` (`../kernel`). Exposes composition,
 * hosting, and contract types only -- internal orchestration/persistence
 * wiring is reachable for advanced embedding (e.g. a Next.js route handler
 * that wants `buildRuntimeHost()` without `node:http`), but nothing here
 * introduces governance logic; every decision still comes from
 * `AocKernel.evaluate()`.
 */

export { loadRuntimeConfiguration, computeConfigurationChecksum } from './configuration/runtime-configuration.js';
export type { RuntimeConfiguration, RuntimeEnvironment, RuntimePersistenceProviderKind, RuntimeFeatureFlags, RuntimeApiKey } from './configuration/runtime-configuration.js';

export { createRuntimeTelemetry } from './telemetry/runtime-telemetry.js';
export type { RuntimeTelemetry, RuntimeTelemetrySnapshot } from './telemetry/runtime-telemetry.js';
export { createRuntimeLogger } from './telemetry/runtime-logger.js';
export type { RuntimeLogger, RuntimeLogFields, RuntimeLogLevel, RuntimeLoggerSink } from './telemetry/runtime-logger.js';

export { createInProcessEventPublisher } from './events/runtime-events.js';
export type { RuntimeEvent, RuntimeEventType, RuntimeEventPublisher, GovernanceEvaluationRequestedEvent, GovernanceEvaluationCompletedEvent } from './events/runtime-events.js';

export { createDefaultKernelProviders } from './providers/kernel-provider-composition.js';
export type { KernelProviderSet, KernelWorldHandles } from './providers/kernel-provider-composition.js';

export { createInMemoryGovernanceStore } from './persistence/in-memory-governance-store.js';
export { createSqliteGovernanceStore } from './persistence/sqlite-governance-store.js';
export type {
  GovernanceStore,
  GovernanceRequestRecord,
  GovernanceEvaluationRecord,
  GovernanceTraceRecord,
  RuntimeEventRecord,
  RuntimeVersionRecord,
  PersistEvaluationInput,
  PersistEvaluationResult,
  PersistEvaluationOutcome,
} from './persistence/governance-store.js';

export { computeRuntimeHealth } from './health/health-check.js';
export type { RuntimeHealthReport, RuntimeHealthStatus, RuntimeHealthDependencies } from './health/health-check.js';

export {
  validateGovernanceEvaluateRequestBody,
  toKernelEvaluationRequest,
  toKernelEvaluationOptions,
  toGovernanceEvaluateResponseBody,
  mapDecisionStatusToHttpStatus,
} from './api/governance-evaluate-contract.js';
export type { GovernanceEvaluateRequestBody, GovernanceEvaluateResponseBody } from './api/governance-evaluate-contract.js';
export { RuntimeHttpError, RuntimeHttpErrors } from './api/runtime-http-errors.js';
export type { RuntimeHttpErrorCode } from './api/runtime-http-errors.js';

export { evaluateGovernanceRequest } from './orchestration/evaluate-governance-request.js';
export type { EvaluateGovernanceRequestInput, EvaluateGovernanceRequestDependencies, EvaluateGovernanceRequestOutcome } from './orchestration/evaluate-governance-request.js';

export { buildRuntimeHost } from './dependency-injection/composition-root.js';
export type { RuntimeHost, RuntimeHostOverrides } from './dependency-injection/composition-root.js';

export { createRuntimeHostRequestListener } from './adapters/node-http-adapter.js';

export { createRuntimeHostServer } from './host/runtime-host-server.js';
export type { RuntimeHostServer } from './host/runtime-host-server.js';
