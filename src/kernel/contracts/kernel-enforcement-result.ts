import type { KernelEvaluationResult } from './kernel-result.js';

/** Mirrors `ExecutionResultStatus` from the wrapped engine. */
export type KernelExecutionStatus = 'not_executed' | 'executed' | 'failed' | 'skipped' | 'duplicate';

export interface KernelExecutionOutcome<T = unknown> {
  readonly status: KernelExecutionStatus;
  readonly executed: boolean;
  readonly value?: T;
  readonly errorMessage?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

/**
 * Returned only by `AocKernel.enforce()` -- the higher-level operation that,
 * unlike `evaluate()`, may invoke a caller-supplied adapter as a real side
 * effect. `execution.executed` is `true` only when the evaluation portion
 * (identical in shape/derivation to `KernelEvaluationResult`) resolved to an
 * executable status and the adapter actually ran.
 */
export interface KernelEnforcementResult<T = unknown> extends KernelEvaluationResult {
  readonly execution: KernelExecutionOutcome<T>;
}
