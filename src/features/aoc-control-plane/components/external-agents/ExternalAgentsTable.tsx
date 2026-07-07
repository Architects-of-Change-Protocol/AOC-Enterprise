import * as React from 'react';
import type { ExternalAgentRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';
import { ExternalStandingBadge } from './ExternalStandingBadge.js';

export interface ExternalAgentsTableProps {
  readonly agents: readonly ExternalAgentRow[];
}

export function ExternalAgentsTable({ agents }: ExternalAgentsTableProps): React.ReactElement {
  if (agents.length === 0) {
    return <AocEmptyState message="No external agents have local standing." />;
  }
  return (
    <table className="aoc-table" aria-label="External agents">
      <thead>
        <tr>
          <th scope="col">Agent</th>
          <th scope="col">Type</th>
          <th scope="col">Standing</th>
          <th scope="col">Issuer</th>
          <th scope="col">First seen</th>
        </tr>
      </thead>
      <tbody>
        {agents.map((agent) => (
          <tr key={agent.id}>
            <th scope="row">{agent.displayName}</th>
            <td>{agent.type}</td>
            <td>
              <ExternalStandingBadge status={agent.status} />
            </td>
            <td>{agent.externalIssuerId ?? '—'}</td>
            <td>{agent.firstSeenAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
