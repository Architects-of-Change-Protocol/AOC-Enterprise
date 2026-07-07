import * as React from 'react';
import type { EnforcementRequestRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface EnforcementRequestsTableProps {
  readonly requests: readonly EnforcementRequestRow[];
  readonly onSelect?: ((request: EnforcementRequestRow) => void) | undefined;
}

export function EnforcementRequestsTable({ requests, onSelect }: EnforcementRequestsTableProps): React.ReactElement {
  if (requests.length === 0) {
    return <AocEmptyState message="No enforcement requests." />;
  }
  return (
    <table className="aoc-table" aria-label="Enforcement requests">
      <thead>
        <tr>
          <th scope="col">Request</th>
          <th scope="col">Mode</th>
          <th scope="col">Actor</th>
          <th scope="col">Action</th>
          <th scope="col">Target</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((request) => (
          <tr key={request.id}>
            <th scope="row">
              {onSelect ? (
                <button type="button" onClick={() => onSelect(request)}>
                  {request.id}
                </button>
              ) : (
                request.id
              )}
            </th>
            <td>{request.mode}</td>
            <td>{request.actorId}</td>
            <td>{request.action}</td>
            <td>
              {request.targetType}: {request.targetName}
            </td>
            <td>{request.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
