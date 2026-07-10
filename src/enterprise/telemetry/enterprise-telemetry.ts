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
}

export interface EnterpriseTelemetry {
  recordEvaluation(status: KernelDecisionStatus, durationMs: number): void;
  recordEnterpriseFailure(): void;
  recordPersistenceFailure(): void;
  recordProviderFailure(): void;
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
      };
    },
  };
}
