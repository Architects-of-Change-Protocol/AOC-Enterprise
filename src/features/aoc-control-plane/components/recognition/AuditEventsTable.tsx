import * as React from 'react';
import type { AuditEventRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface AuditEventsTableProps {
  readonly events: readonly AuditEventRow[];
}

export function AuditEventsTable({ events }: AuditEventsTableProps): React.ReactElement {
  if (events.length === 0) {
    return <AocEmptyState message="No audit events recorded." />;
  }
  return (
    <table className="aoc-table" aria-label="Audit events">
      <thead>
        <tr>
          <th scope="col">Event</th>
          <th scope="col">Type</th>
          <th scope="col">Actor</th>
          <th scope="col">Timestamp</th>
          <th scope="col">Hash</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id}>
            <th scope="row">{event.id}</th>
            <td>{event.eventType}</td>
            <td>{event.actorId}</td>
            <td>{event.timestamp}</td>
            <td>
              <code title={event.eventHash}>{event.eventHash.slice(0, 10)}…</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
