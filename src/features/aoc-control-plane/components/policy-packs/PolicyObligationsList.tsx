import * as React from 'react';
import type { PolicyObligationRow } from '../../domain/policy-pack-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface PolicyObligationsListProps {
  readonly obligations: readonly PolicyObligationRow[];
}

export function PolicyObligationsList({ obligations }: PolicyObligationsListProps): React.ReactElement {
  if (obligations.length === 0) {
    return <AocEmptyState message="No obligations." />;
  }
  return (
    <ul className="aoc-policy-obligations-list">
      {obligations.map((obligation) => (
        <li key={obligation.id}>
          <strong>{obligation.type.replace(/_/g, ' ')}</strong> — {obligation.description}{' '}
          <span className={`aoc-badge aoc-badge--${obligation.required ? 'warning' : 'neutral'}`} role="status">
            {obligation.required ? 'required' : 'optional'}
          </span>
          {obligation.sourceRuleId !== undefined ? <span className="aoc-policy-obligations-list__source"> (rule {obligation.sourceRuleId})</span> : null}
        </li>
      ))}
    </ul>
  );
}
