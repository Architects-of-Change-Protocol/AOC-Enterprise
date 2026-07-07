import * as React from 'react';
import type { AgentVisaRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface AgentVisasTableProps {
  readonly visas: readonly AgentVisaRow[];
  readonly onRevoke?: ((visa: AgentVisaRow) => void) | undefined;
}

export function AgentVisasTable({ visas, onRevoke }: AgentVisasTableProps): React.ReactElement {
  if (visas.length === 0) {
    return <AocEmptyState message="No active external visas." />;
  }
  return (
    <table className="aoc-table" aria-label="Agent visas">
      <thead>
        <tr>
          <th scope="col">Visa</th>
          <th scope="col">External agent</th>
          <th scope="col">Status</th>
          <th scope="col">Allowed actions</th>
          <th scope="col">Issued</th>
          <th scope="col">Expires</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {visas.map((visa) => (
          <tr key={visa.id}>
            <th scope="row">{visa.id}</th>
            <td>{visa.externalAgentId}</td>
            <td>{visa.status}</td>
            <td>{visa.allowedActions.join(', ') || '—'}</td>
            <td>{visa.issuedAt}</td>
            <td>{visa.expiresAt ?? '—'}</td>
            <td>
              <button
                type="button"
                disabled={onRevoke === undefined || visa.status !== 'active'}
                title={onRevoke === undefined ? 'Command wiring not enabled in this read-only demo.' : 'Revoke this visa.'}
                onClick={() => onRevoke?.(visa)}
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
