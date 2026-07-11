import type { KernelDecisionStatus } from '../../kernel/index.js';

/**
 * Operational metrics the AOC Enterprise Host owns. The Kernel stays
 * deterministic and reports nothing about its own operational health --
 * these counters are derived entirely from the outside, by observing
 * `evaluate()` calls, never by asking the Kernel to instrument itself.
 */
export interface EnterpriseMetricsSnapshot {
  readonly evaluationCount: number;
  readonly averageEvaluationDurationMs: number;
  readonly deniedCount: number;
  readonly approvalRequiredCount: number;
  readonly allowedCount: number;
  readonly indeterminateCount: number;
  readonly enterpriseFailureCount: number;
  readonly persistenceFailureCount: number;
  readonly providerFailureCount: number;
  /** Lifecycle metrics (mission section 27): `enterprise_startup_total` / `enterprise_startup_failures_total`. */
  readonly startupCount: number;
  readonly startupFailureCount: number;
  /** `enterprise_shutdown_total` / `enterprise_shutdown_failures_total`. */
  readonly shutdownCount: number;
  readonly shutdownFailureCount: number;
  /** `enterprise_module_failures_total`. */
  readonly moduleFailureCount: number;
  /** `governance_store_append_total` / `governance_store_append_failures_total` / `governance_store_append_duration_ms` (PR-004 section 75). */
  readonly storeAppendCount: number;
  readonly storeAppendFailureCount: number;
  readonly averageStoreAppendDurationMs: number;
  /** `governance_store_idempotent_replays_total` / `governance_store_idempotency_conflicts_total`. */
  readonly storeIdempotentReplayCount: number;
  readonly storeIdempotencyConflictCount: number;
  /** `governance_store_queries_total` / `governance_store_query_duration_ms`. */
  readonly storeQueryCount: number;
  readonly averageStoreQueryDurationMs: number;
  /** `governance_store_integrity_verifications_total` / `governance_store_integrity_failures_total` / `governance_store_corrupted_records_total`. */
  readonly storeVerificationCount: number;
  readonly storeIntegrityFailureCount: number;
  readonly storeCorruptedRecordCount: number;
}

export interface EnterpriseTelemetry {
  recordEvaluation(status: KernelDecisionStatus, durationMs: number): void;
  recordEnterpriseFailure(): void;
  recordPersistenceFailure(): void;
  recordProviderFailure(): void;
  /** `enterprise_startup_total` / `enterprise_startup_failures_total` / `enterprise_startup_duration_ms` (mission section 27). */
  recordStartup(success: boolean): void;
  /** `enterprise_shutdown_total` / `enterprise_shutdown_failures_total` / `enterprise_shutdown_duration_ms`. */
  recordShutdown(success: boolean): void;
  /** `enterprise_module_failures_total`, tagged by module id via the log line this call triggers -- the counter itself stays a flat total, matching every other counter in this snapshot. */
  recordModuleFailure(moduleId: string): void;
  /** One committed-or-replayed Governance Store append. `idempotentReplay: true` means an equivalent aggregate already existed and nothing new was written. */
  recordStoreAppend(durationMs: number, idempotentReplay: boolean): void;
  recordStoreAppendFailure(): void;
  recordStoreIdempotencyConflict(): void;
  recordStoreQuery(durationMs: number): void;
  /** One integrity verification run; `valid: false` also increments the integrity-failure counter. */
  recordStoreVerification(valid: boolean): void;
  recordStoreCorruptedRecord(): void;
  snapshot(): EnterpriseMetricsSnapshot;
}

export function createEnterpriseTelemetry(): EnterpriseTelemetry {
  let evaluationCount = 0;
  let totalDurationMs = 0;
  let deniedCount = 0;
  let approvalRequiredCount = 0;
  let allowedCount = 0;
  let indeterminateCount = 0;
  let enterpriseFailureCount = 0;
  let persistenceFailureCount = 0;
  let providerFailureCount = 0;
  let startupCount = 0;
  let startupFailureCount = 0;
  let shutdownCount = 0;
  let shutdownFailureCount = 0;
  let moduleFailureCount = 0;
  let storeAppendCount = 0;
  let storeAppendFailureCount = 0;
  let storeAppendTotalDurationMs = 0;
  let storeIdempotentReplayCount = 0;
  let storeIdempotencyConflictCount = 0;
  let storeQueryCount = 0;
  let storeQueryTotalDurationMs = 0;
  let storeVerificationCount = 0;
  let storeIntegrityFailureCount = 0;
  let storeCorruptedRecordCount = 0;

  return {
    recordEvaluation(status, durationMs) {
      evaluationCount += 1;
      totalDurationMs += durationMs;
      switch (status) {
        case 'denied':
          deniedCount += 1;
          break;
        case 'approval_required':
          approvalRequiredCount += 1;
          break;
        case 'allowed':
          allowedCount += 1;
          break;
        case 'indeterminate':
          indeterminateCount += 1;
          break;
      }
    },
    recordEnterpriseFailure() {
      enterpriseFailureCount += 1;
    },
    recordPersistenceFailure() {
      persistenceFailureCount += 1;
    },
    recordProviderFailure() {
      providerFailureCount += 1;
    },
    recordStartup(success) {
      startupCount += 1;
      if (!success) startupFailureCount += 1;
    },
    recordShutdown(success) {
      shutdownCount += 1;
      if (!success) shutdownFailureCount += 1;
    },
    recordModuleFailure() {
      moduleFailureCount += 1;
    },
    recordStoreAppend(durationMs, idempotentReplay) {
      storeAppendCount += 1;
      storeAppendTotalDurationMs += durationMs;
      if (idempotentReplay) storeIdempotentReplayCount += 1;
    },
    recordStoreAppendFailure() {
      storeAppendFailureCount += 1;
    },
    recordStoreIdempotencyConflict() {
      storeIdempotencyConflictCount += 1;
    },
    recordStoreQuery(durationMs) {
      storeQueryCount += 1;
      storeQueryTotalDurationMs += durationMs;
    },
    recordStoreVerification(valid) {
      storeVerificationCount += 1;
      if (!valid) storeIntegrityFailureCount += 1;
    },
    recordStoreCorruptedRecord() {
      storeCorruptedRecordCount += 1;
    },
    snapshot(): EnterpriseMetricsSnapshot {
      return {
        evaluationCount,
        averageEvaluationDurationMs: evaluationCount === 0 ? 0 : totalDurationMs / evaluationCount,
        deniedCount,
        approvalRequiredCount,
        allowedCount,
        indeterminateCount,
        enterpriseFailureCount,
        persistenceFailureCount,
        providerFailureCount,
        startupCount,
        startupFailureCount,
        shutdownCount,
        shutdownFailureCount,
        moduleFailureCount,
        storeAppendCount,
        storeAppendFailureCount,
        averageStoreAppendDurationMs: storeAppendCount === 0 ? 0 : storeAppendTotalDurationMs / storeAppendCount,
        storeIdempotentReplayCount,
        storeIdempotencyConflictCount,
        storeQueryCount,
        averageStoreQueryDurationMs: storeQueryCount === 0 ? 0 : storeQueryTotalDurationMs / storeQueryCount,
        storeVerificationCount,
        storeIntegrityFailureCount,
        storeCorruptedRecordCount,
      };
    },
  };
}
