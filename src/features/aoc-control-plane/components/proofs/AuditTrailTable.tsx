import * as React from 'react';
import type { AuditEventRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface AuditTrailTableProps {
  readonly auditEvents: readonly AuditEventRow[];
}

export function AuditTrailTable({ auditEvents }: AuditTrailTableProps): React.ReactElement {
  if (auditEvents.length === 0) {
    return <AocEmptyState message="No audit trail recorded." />;
  }
  return (
    <table className="aoc-table" aria-label="Audit trail">
      <thead>
        <tr>
          <th scope="col">Event</th>
          <th scope="col">Type</th>
          <th scope="col">Actor</th>
          <th scope="col">Timestamp</th>
          <th scope="col">Hash</th>
          <th scope="col">Previous hash</th>
        </tr>
      </thead>
      <tbody>
        {auditEvents.map((event) => (
          <tr key={event.id}>
            <th scope="row">{event.id}</th>
            <td>{event.eventType}</td>
            <td>{event.actorId}</td>
            <td>{event.timestamp}</td>
            <td>
              <code title={event.eventHash}>{event.eventHash.slice(0, 10)}…</code>
            </td>
            <td>{event.previousHash !== undefined ? <code title={event.previousHash}>{event.previousHash.slice(0, 10)}…</code> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
