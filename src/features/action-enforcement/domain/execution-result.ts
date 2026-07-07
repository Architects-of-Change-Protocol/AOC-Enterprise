export type ExecutionResultStatus = 'not_executed' | 'executed' | 'failed' | 'skipped' | 'duplicate';

export interface ExecutionResult<T = unknown> {
  readonly id: string;

  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;

  readonly status: ExecutionResultStatus;

  readonly executed: boolean;

  readonly value?: T;
  readonly errorMessage?: string;

  readonly startedAt?: string;
  readonly completedAt?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
