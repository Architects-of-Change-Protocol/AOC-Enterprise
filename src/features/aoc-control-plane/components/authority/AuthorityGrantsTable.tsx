import * as React from 'react';
import type { AuthorityGrantRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface AuthorityGrantsTableProps {
  readonly grants: readonly AuthorityGrantRow[];
  readonly onRevoke?: ((grant: AuthorityGrantRow) => void) | undefined;
}

export function AuthorityGrantsTable({ grants, onRevoke }: AuthorityGrantsTableProps): React.ReactElement {
  if (grants.length === 0) {
    return <AocEmptyState message="No authority grants issued." />;
  }
  return (
    <table className="aoc-table" aria-label="Authority grants">
      <thead>
        <tr>
          <th scope="col">Grant</th>
          <th scope="col">Issuer</th>
          <th scope="col">Subject</th>
          <th scope="col">Capability</th>
          <th scope="col">Status</th>
          <th scope="col">Can delegate</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {grants.map((grant) => (
          <tr key={grant.id}>
            <th scope="row">{grant.id}</th>
            <td>{grant.issuerActorId}</td>
            <td>{grant.subjectActorId}</td>
            <td>{grant.capability}</td>
            <td>{grant.status}</td>
            <td>{grant.canDelegate ? 'Yes' : 'No'}</td>
            <td>
              <button
                type="button"
                disabled={onRevoke === undefined || grant.status !== 'active'}
                title={onRevoke === undefined ? 'Command wiring not enabled in this read-only demo.' : 'Revoke this authority grant.'}
                onClick={() => onRevoke?.(grant)}
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
