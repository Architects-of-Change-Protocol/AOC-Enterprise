import * as React from 'react';
import type { TrustBoundaryRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface TrustBoundarySummaryProps {
  readonly trustBoundaries: readonly TrustBoundaryRow[];
}

export function TrustBoundarySummary({ trustBoundaries }: TrustBoundarySummaryProps): React.ReactElement {
  if (trustBoundaries.length === 0) {
    return <AocEmptyState message="No trust boundary configured for this trust domain." />;
  }
  return (
    <ul className="aoc-trust-boundary-summary">
      {trustBoundaries.map((boundary) => (
        <li key={boundary.id}>
          <dl className="aoc-detail">
            <dt>Status</dt>
            <dd>{boundary.status}</dd>
            <dt>Allowed agent types</dt>
            <dd>{boundary.allowedAgentTypes.join(', ') || '—'}</dd>
            <dt>Requires approval for unknown issuers</dt>
            <dd>{boundary.requiresApprovalForUnknownIssuers ? 'Yes' : 'No'}</dd>
            <dt>Requires approval for high risk</dt>
            <dd>{boundary.requiresApprovalForHighRisk ? 'Yes' : 'No'}</dd>
            <dt>Max visa TTL (minutes)</dt>
            <dd>{boundary.maxVisaTtlMinutes}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
