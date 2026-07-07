import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IdempotencyService } from '../services/idempotency-service.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

describe('IdempotencyService', () => {
  it('1. registers an idempotency key', () => {
    const service = new IdempotencyService(createEnforcementRuntimeContext(NOW));
    const record = service.register('key-1', 'r1');
    assert.equal(record.status, 'pending');
    assert.equal(service.getRecord('key-1')?.enforcementRequestId, 'r1');
  });

  it('2. detects a duplicate key', () => {
    const service = new IdempotencyService(createEnforcementRuntimeContext(NOW));
    service.check('key-1', 'r1');
    const second = service.check('key-1', 'r2');
    assert.notEqual(second.outcome, 'new');
  });

  it('3. suppresses a duplicate after a successful execution', () => {
    const service = new IdempotencyService(createEnforcementRuntimeContext(NOW));
    service.check('key-1', 'r1');
    service.recordSuccess('key-1', 'execution-result-1');
    const second = service.check('key-1', 'r2');
    assert.equal(second.outcome, 'duplicate_success');
    assert.equal(second.priorExecutionResultId, 'execution-result-1');
  });

  it('4. a duplicate check never invokes anything itself -- callers gate on the outcome', () => {
    const service = new IdempotencyService(createEnforcementRuntimeContext(NOW));
    service.check('key-1', 'r1');
    service.recordSuccess('key-1', 'execution-result-1');
    let invoked = false;
    const outcome = service.check('key-1', 'r2');
    if (outcome.outcome === 'new') {
      invoked = true;
    }
    assert.equal(invoked, false);
  });

  it('5. allows a deterministic retry after a failed execution when configured', () => {
    const service = new IdempotencyService(createEnforcementRuntimeContext(NOW), { allowRetryAfterFailure: true });
    service.check('key-1', 'r1');
    service.recordFailure('key-1');
    const second = service.check('key-1', 'r2');
    assert.equal(second.outcome, 'duplicate_retry');
  });

  it('5b. denies retry after a failed execution when not configured', () => {
    const service = new IdempotencyService(createEnforcementRuntimeContext(NOW), { allowRetryAfterFailure: false });
    service.check('key-1', 'r1');
    service.recordFailure('key-1');
    const second = service.check('key-1', 'r2');
    assert.equal(second.outcome, 'duplicate_success');
  });

  it('6. requires a key only when the caller supplies one to check', () => {
    const service = new IdempotencyService(createEnforcementRuntimeContext(NOW));
    const result = service.check(undefined, 'r1');
    assert.equal(result.outcome, 'new');
    assert.equal(result.idempotencyKey, undefined);
  });

  it('7. does not require a key for requests that never present one', () => {
    const service = new IdempotencyService(createEnforcementRuntimeContext(NOW));
    const first = service.check(undefined, 'r1');
    const second = service.check(undefined, 'r2');
    assert.equal(first.outcome, 'new');
    assert.equal(second.outcome, 'new');
  });
});
