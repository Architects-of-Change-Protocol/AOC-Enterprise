import * as React from 'react';
import type { PolicyEventRow } from '../../domain/policy-pack-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface PolicyEventsTableProps {
  readonly events: readonly PolicyEventRow[];
}

export function PolicyEventsTable({ events }: PolicyEventsTableProps): React.ReactElement {
  if (events.length === 0) {
    return <AocEmptyState message="No policy events recorded." />;
  }
  return (
    <table className="aoc-table" aria-label="Policy events">
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Event Type</th>
          <th scope="col">Pack</th>
          <th scope="col">Version</th>
          <th scope="col">Evaluation</th>
          <th scope="col">Decision</th>
          <th scope="col">Proof</th>
          <th scope="col">Event Hash</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id}>
            <th scope="row">{event.timestamp}</th>
            <td title={event.summary}>{event.type}</td>
            <td>{event.policyPackId ?? '—'}</td>
            <td>{event.policyPackVersionId ?? '—'}</td>
            <td>{event.evaluationId ?? '—'}</td>
            <td>{event.decisionId ?? '—'}</td>
            <td>{event.proofId ?? '—'}</td>
            <td>
              <code title={event.eventHash}>{event.eventHash.slice(0, 12)}…</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
