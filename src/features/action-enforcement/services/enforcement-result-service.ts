import type { ExecutionResult } from '../domain/execution-result.js';
import type { EnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import type { EnforcementStore } from './enforcement-store.js';

export interface MarkNotExecutedInput {
  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MarkExecutedInput<T> {
  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;
  readonly value: T;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface MarkFailedInput {
  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;
  readonly errorMessage: string;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface MarkSkippedInput {
  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MarkDuplicateInput {
  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;
  readonly priorExecutionResultId?: string;
}

/**
 * Creates and retrieves ExecutionResults. This is the only service allowed
 * to declare a request "executed" -- it never invokes anything itself, it
 * only records what GuardedExecutionService already observed.
 */
export class EnforcementResultService {
  constructor(
    private readonly ctx: EnforcementRuntimeContext,
    private readonly store: EnforcementStore,
  ) {}

  markNotExecuted(input: MarkNotExecutedInput): ExecutionResult {
    return this.save({
      id: this.ctx.ids.nextId('execution-result'),
      enforcementRequestId: input.enforcementRequestId,
      enforcementDecisionId: input.enforcementDecisionId,
      status: 'not_executed',
      executed: false,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
  }

  markExecuted<T>(input: MarkExecutedInput<T>): ExecutionResult<T> {
    return this.save({
      id: this.ctx.ids.nextId('execution-result'),
      enforcementRequestId: input.enforcementRequestId,
      enforcementDecisionId: input.enforcementDecisionId,
      status: 'executed',
      executed: true,
      value: input.value,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
    });
  }

  markFailed(input: MarkFailedInput): ExecutionResult {
    return this.save({
      id: this.ctx.ids.nextId('execution-result'),
      enforcementRequestId: input.enforcementRequestId,
      enforcementDecisionId: input.enforcementDecisionId,
      status: 'failed',
      executed: false,
      errorMessage: input.errorMessage,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
    });
  }

  markSkipped(input: MarkSkippedInput): ExecutionResult {
    return this.save({
      id: this.ctx.ids.nextId('execution-result'),
      enforcementRequestId: input.enforcementRequestId,
      enforcementDecisionId: input.enforcementDecisionId,
      status: 'skipped',
      executed: false,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
  }

  markDuplicate(input: MarkDuplicateInput): ExecutionResult {
    return this.save({
      id: this.ctx.ids.nextId('execution-result'),
      enforcementRequestId: input.enforcementRequestId,
      enforcementDecisionId: input.enforcementDecisionId,
      status: 'duplicate',
      executed: false,
      ...(input.priorExecutionResultId !== undefined ? { metadata: { priorExecutionResultId: input.priorExecutionResultId } } : {}),
    });
  }

  getResult(executionResultId: string): ExecutionResult | undefined {
    return this.store.getResult(executionResultId);
  }

  getResultsByRequest(enforcementRequestId: string): readonly ExecutionResult[] {
    return this.store.getResultsByRequest(enforcementRequestId);
  }

  private save<T>(result: ExecutionResult<T>): ExecutionResult<T> {
    this.store.saveResult(result);
    return result;
  }
}
