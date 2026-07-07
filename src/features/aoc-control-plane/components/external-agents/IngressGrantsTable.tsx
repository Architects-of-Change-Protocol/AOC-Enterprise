import * as React from 'react';
import type { IngressGrantRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface IngressGrantsTableProps {
  readonly ingressGrants: readonly IngressGrantRow[];
  readonly onRevoke?: ((grant: IngressGrantRow) => void) | undefined;
}

export function IngressGrantsTable({ ingressGrants, onRevoke }: IngressGrantsTableProps): React.ReactElement {
  if (ingressGrants.length === 0) {
    return <AocEmptyState message="No active ingress grants." />;
  }
  return (
    <table className="aoc-table" aria-label="Ingress grants">
      <thead>
        <tr>
          <th scope="col">Grant</th>
          <th scope="col">External agent</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
          <th scope="col">Resource scopes</th>
          <th scope="col">Issued</th>
          <th scope="col"></th>
        </tr>
      </thead>
      <tbody>
        {ingressGrants.map((grant) => (
          <tr key={grant.id}>
            <th scope="row">{grant.id}</th>
            <td>{grant.externalAgentId}</td>
            <td>{grant.status}</td>
            <td>{grant.actions.join(', ') || '—'}</td>
            <td>{grant.resourceScopes.join(', ') || '—'}</td>
            <td>{grant.issuedAt}</td>
            <td>
              <button
                type="button"
                disabled={onRevoke === undefined || grant.status !== 'active'}
                title={onRevoke === undefined ? 'Command wiring not enabled in this read-only demo.' : 'Revoke this ingress grant.'}
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
