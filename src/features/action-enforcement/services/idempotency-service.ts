import type { IdempotencyCheckResult, IdempotencyKey, IdempotencyRecord } from '../domain/idempotency-key.js';
import type { EnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

export interface IdempotencyServiceOptions {
  /** Whether a prior *failed* execution for the same key may be retried. Defaults to true. */
  readonly allowRetryAfterFailure?: boolean;
}

/**
 * Prevents the same idempotency key from causing a second real side effect.
 * A key that already succeeded is always suppressed; a key that previously
 * failed may retry only when configured to allow it.
 */
export class IdempotencyService {
  private readonly records = new Map<IdempotencyKey, IdempotencyRecord>();
  private readonly allowRetryAfterFailure: boolean;

  constructor(
    private readonly ctx: EnforcementRuntimeContext,
    options: IdempotencyServiceOptions = {},
  ) {
    this.allowRetryAfterFailure = options.allowRetryAfterFailure ?? true;
  }

  check(idempotencyKey: string | undefined, enforcementRequestId: string): IdempotencyCheckResult {
    if (idempotencyKey === undefined) {
      return { outcome: 'new' };
    }

    const existing = this.records.get(idempotencyKey);
    if (!existing) {
      this.register(idempotencyKey, enforcementRequestId);
      return { outcome: 'new', idempotencyKey };
    }

    if (existing.status === 'succeeded') {
      return {
        outcome: 'duplicate_success',
        idempotencyKey,
        ...(existing.executionResultId !== undefined ? { priorExecutionResultId: existing.executionResultId } : {}),
        record: existing,
      };
    }

    if (existing.status === 'failed') {
      return { outcome: this.allowRetryAfterFailure ? 'duplicate_retry' : 'duplicate_success', idempotencyKey, record: existing };
    }

    // 'pending' (an in-flight or never-recorded attempt): treat as already claimed, same as a success, to avoid a second concurrent side effect.
    return { outcome: 'duplicate_success', idempotencyKey, record: existing };
  }

  register(idempotencyKey: IdempotencyKey, enforcementRequestId: string): IdempotencyRecord {
    const now = this.ctx.clock.now();
    const record: IdempotencyRecord = {
      idempotencyKey,
      enforcementRequestId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(idempotencyKey, record);
    return record;
  }

  recordSuccess(idempotencyKey: string | undefined, executionResultId: string): void {
    if (idempotencyKey === undefined) {
      return;
    }
    const existing = this.records.get(idempotencyKey);
    const updated: IdempotencyRecord = {
      idempotencyKey,
      enforcementRequestId: existing?.enforcementRequestId ?? '',
      status: 'succeeded',
      executionResultId,
      createdAt: existing?.createdAt ?? this.ctx.clock.now(),
      updatedAt: this.ctx.clock.now(),
    };
    this.records.set(idempotencyKey, updated);
  }

  recordFailure(idempotencyKey: string | undefined): void {
    if (idempotencyKey === undefined) {
      return;
    }
    const existing = this.records.get(idempotencyKey);
    const updated: IdempotencyRecord = {
      idempotencyKey,
      enforcementRequestId: existing?.enforcementRequestId ?? '',
      status: 'failed',
      createdAt: existing?.createdAt ?? this.ctx.clock.now(),
      updatedAt: this.ctx.clock.now(),
    };
    this.records.set(idempotencyKey, updated);
  }

  getRecord(idempotencyKey: string): IdempotencyRecord | undefined {
    return this.records.get(idempotencyKey);
  }
}
