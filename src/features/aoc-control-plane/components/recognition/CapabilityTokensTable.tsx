import * as React from 'react';
import type { CapabilityTokenRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';
import { AocProofLink } from '../AocProofLink.js';

export interface CapabilityTokensTableProps {
  readonly tokens: readonly CapabilityTokenRow[];
}

export function CapabilityTokensTable({ tokens }: CapabilityTokensTableProps): React.ReactElement {
  if (tokens.length === 0) {
    return <AocEmptyState message="No capability tokens issued." />;
  }
  return (
    <table className="aoc-table" aria-label="Capability tokens">
      <thead>
        <tr>
          <th scope="col">Token</th>
          <th scope="col">Subject</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
          <th scope="col">Resource scopes</th>
          <th scope="col">Evidence required</th>
          <th scope="col">Approval required</th>
          <th scope="col">Proof</th>
        </tr>
      </thead>
      <tbody>
        {tokens.map((token) => (
          <tr key={token.id}>
            <th scope="row">{token.id}</th>
            <td>{token.subjectActorId}</td>
            <td>{token.status}</td>
            <td>{token.allowedActions.join(', ') || '—'}</td>
            <td>{token.resourceScopes.join(', ') || '—'}</td>
            <td>{token.requiresEvidence ? 'Yes' : 'No'}</td>
            <td>{token.requiresHumanApproval ? 'Yes' : 'No'}</td>
            <td>
              <AocProofLink proofHash={token.tokenHash} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
