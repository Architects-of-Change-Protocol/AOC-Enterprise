import * as React from 'react';
import type { ControlPlaneSearchableItem } from '../services/control-plane-query-service.js';
import { AocEmptyState } from './AocEmptyState.js';

export interface AocSearchResultsTableProps {
  readonly results: readonly ControlPlaneSearchableItem[];
}

export function AocSearchResultsTable({ results }: AocSearchResultsTableProps): React.ReactElement {
  if (results.length === 0) {
    return <AocEmptyState message="No results match the current search and filters." />;
  }
  return (
    <table className="aoc-table" aria-label="Search results">
      <thead>
        <tr>
          <th scope="col">Id</th>
          <th scope="col">Source</th>
          <th scope="col">Actor</th>
          <th scope="col">Action</th>
          <th scope="col">Status</th>
          <th scope="col">Reason code</th>
          <th scope="col">Created</th>
        </tr>
      </thead>
      <tbody>
        {results.map((item) => (
          <tr key={`${item.source}-${item.id}`}>
            <th scope="row">{item.id}</th>
            <td>{item.source}</td>
            <td>{item.actorId ?? '—'}</td>
            <td>{item.action ?? '—'}</td>
            <td>{item.status ?? '—'}</td>
            <td>{item.reasonCode ?? '—'}</td>
            <td>{item.createdAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
