import * as React from 'react';
import type { ApprovalRequestRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';
import { AocRiskBadge } from '../AocRiskBadge.js';
import { ApprovalQuorumIndicator } from './ApprovalQuorumIndicator.js';

export interface ApprovalRequestsTableProps {
  readonly requests: readonly ApprovalRequestRow[];
  readonly onSelect?: ((request: ApprovalRequestRow) => void) | undefined;
}

export function ApprovalRequestsTable({ requests, onSelect }: ApprovalRequestsTableProps): React.ReactElement {
  if (requests.length === 0) {
    return <AocEmptyState message="No pending approvals." />;
  }
  return (
    <table className="aoc-table" aria-label="Approval requests">
      <thead>
        <tr>
          <th scope="col">Request</th>
          <th scope="col">Action</th>
          <th scope="col">Requested by</th>
          <th scope="col">Risk</th>
          <th scope="col">Status</th>
          <th scope="col">Quorum</th>
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
            <td>{request.action}</td>
            <td>{request.requestedByActorId}</td>
            <td>
              <AocRiskBadge riskLevel={request.riskLevel} />
            </td>
            <td>{request.status}</td>
            <td>
              <ApprovalQuorumIndicator request={request} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
