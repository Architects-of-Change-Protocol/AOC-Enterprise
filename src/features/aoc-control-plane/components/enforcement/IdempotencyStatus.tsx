import * as React from 'react';
import type { EnforcementRequestRow } from '../../domain/control-plane-view-model.js';

export interface IdempotencyStatusProps {
  readonly request: EnforcementRequestRow;
  readonly isDuplicate: boolean;
}

export function IdempotencyStatus({ request, isDuplicate }: IdempotencyStatusProps): React.ReactElement {
  if (request.idempotencyKey === undefined) {
    return <span className="aoc-idempotency-status aoc-idempotency-status--none">No idempotency key</span>;
  }
  return (
    <span className={`aoc-idempotency-status aoc-idempotency-status--${isDuplicate ? 'duplicate' : 'unique'}`}>
      <code>{request.idempotencyKey}</code> {isDuplicate ? '(duplicate suppressed)' : '(first use)'}
    </span>
  );
}
