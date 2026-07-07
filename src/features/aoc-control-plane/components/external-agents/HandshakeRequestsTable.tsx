import * as React from 'react';
import type { HandshakeRequestRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface HandshakeRequestsTableProps {
  readonly requests: readonly HandshakeRequestRow[];
  readonly onSelect?: ((request: HandshakeRequestRow) => void) | undefined;
}

export function HandshakeRequestsTable({ requests, onSelect }: HandshakeRequestsTableProps): React.ReactElement {
  if (requests.length === 0) {
    return <AocEmptyState message="No handshake requests." />;
  }
  return (
    <table className="aoc-table" aria-label="Handshake requests">
      <thead>
        <tr>
          <th scope="col">Request</th>
          <th scope="col">External agent</th>
          <th scope="col">Status</th>
          <th scope="col">Requested actions</th>
          <th scope="col">Created</th>
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
            <td>{request.externalAgentId}</td>
            <td>{request.status}</td>
            <td>{request.requestedActions.join(', ') || '—'}</td>
            <td>{request.createdAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
