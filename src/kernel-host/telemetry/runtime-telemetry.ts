import type { KernelDecisionStatus } from '../../kernel/index.js';

/**
 * Operational metrics the Runtime Host owns. The Kernel stays deterministic
 * and reports nothing about its own operational health -- these counters
 * are derived entirely from the outside, by observing `evaluate()` calls,
 * never by asking the Kernel to instrument itself.
 */
export interface RuntimeTelemetrySnapshot {
  readonly evaluationCount: number;
  readonly averageEvaluationDurationMs: number;
  readonly deniedCount: number;
  readonly approvalRequiredCount: number;
  readonly allowedCount: number;
  readonly indeterminateCount: number;
  readonly runtimeFailureCount: number;
  readonly persistenceFailureCount: number;
  readonly providerFailureCount: number;
}

export interface RuntimeTelemetry {
  recordEvaluation(status: KernelDecisionStatus, durationMs: number): void;
  recordRuntimeFailure(): void;
  recordPersistenceFailure(): void;
  recordProviderFailure(): void;
  snapshot(): RuntimeTelemetrySnapshot;
}

export function createRuntimeTelemetry(): RuntimeTelemetry {
  let evaluationCount = 0;
  let totalDurationMs = 0;
  let deniedCount = 0;
  let approvalRequiredCount = 0;
  let allowedCount = 0;
  let indeterminateCount = 0;
  let runtimeFailureCount = 0;
  let persistenceFailureCount = 0;
  let providerFailureCount = 0;

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
    recordRuntimeFailure() {
      runtimeFailureCount += 1;
    },
    recordPersistenceFailure() {
      persistenceFailureCount += 1;
    },
    recordProviderFailure() {
      providerFailureCount += 1;
    },
    snapshot(): RuntimeTelemetrySnapshot {
      return {
        evaluationCount,
        averageEvaluationDurationMs: evaluationCount === 0 ? 0 : totalDurationMs / evaluationCount,
        deniedCount,
        approvalRequiredCount,
        allowedCount,
        indeterminateCount,
        runtimeFailureCount,
        persistenceFailureCount,
        providerFailureCount,
      };
    },
  };
}
