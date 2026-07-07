export type IdempotencyKey = string;

export type IdempotencyRecordStatus = 'pending' | 'succeeded' | 'failed';

export interface IdempotencyRecord {
  readonly idempotencyKey: IdempotencyKey;
  readonly enforcementRequestId: string;
  readonly status: IdempotencyRecordStatus;
  readonly executionResultId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type IdempotencyOutcome = 'new' | 'duplicate_success' | 'duplicate_retry';

export interface IdempotencyCheckResult {
  readonly outcome: IdempotencyOutcome;
  readonly idempotencyKey?: IdempotencyKey;
  readonly priorExecutionResultId?: string;
  readonly record?: IdempotencyRecord;
}
