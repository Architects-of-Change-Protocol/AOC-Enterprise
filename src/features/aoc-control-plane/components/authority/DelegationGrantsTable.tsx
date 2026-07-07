import * as React from 'react';
import type { DelegationGrantRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface DelegationGrantsTableProps {
  readonly delegations: readonly DelegationGrantRow[];
  readonly onRevoke?: ((delegation: DelegationGrantRow) => void) | undefined;
}

export function DelegationGrantsTable({ delegations, onRevoke }: DelegationGrantsTableProps): React.ReactElement {
  if (delegations.length === 0) {
    return <AocEmptyState message="No delegation grants issued." />;
  }
  return (
    <table className="aoc-table" aria-label="Delegation grants">
      <thead>
        <tr>
          <th scope="col">Delegation</th>
          <th scope="col">Delegator</th>
          <th scope="col">Delegate</th>
          <th scope="col">Capability</th>
          <th scope="col">Depth</th>
          <th scope="col">Can redelegate</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {delegations.map((delegation) => (
          <tr key={delegation.id}>
            <th scope="row">{delegation.id}</th>
            <td>{delegation.delegatorActorId}</td>
            <td>{delegation.delegateActorId}</td>
            <td>{delegation.capability}</td>
            <td>{delegation.delegationDepth}</td>
            <td>{delegation.canRedelegate ? 'Yes' : 'No'}</td>
            <td>{delegation.status}</td>
            <td>
              <button
                type="button"
                disabled={onRevoke === undefined || delegation.status !== 'active'}
                title={onRevoke === undefined ? 'Command wiring not enabled in this read-only demo.' : 'Revoke this delegation grant.'}
                onClick={() => onRevoke?.(delegation)}
              >
                Revoke
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
