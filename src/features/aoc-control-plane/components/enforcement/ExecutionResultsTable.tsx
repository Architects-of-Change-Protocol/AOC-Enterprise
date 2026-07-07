import * as React from 'react';
import type { ExecutionResultRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface ExecutionResultsTableProps {
  readonly results: readonly ExecutionResultRow[];
}

/** Never shows a result as executed unless ExecutionResult.executed is true on the underlying row. */
export function ExecutionResultsTable({ results }: ExecutionResultsTableProps): React.ReactElement {
  if (results.length === 0) {
    return <AocEmptyState message="No execution results recorded." />;
  }
  return (
    <table className="aoc-table" aria-label="Execution results">
      <thead>
        <tr>
          <th scope="col">Result</th>
          <th scope="col">Status</th>
          <th scope="col">Executed</th>
          <th scope="col">Error</th>
          <th scope="col">Started</th>
          <th scope="col">Completed</th>
        </tr>
      </thead>
      <tbody>
        {results.map((result) => (
          <tr key={result.id}>
            <th scope="row">{result.id}</th>
            <td>{result.status}</td>
            <td>{result.executed ? 'Yes' : 'No'}</td>
            <td>{result.errorMessage ?? '—'}</td>
            <td>{result.startedAt ?? '—'}</td>
            <td>{result.completedAt ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
