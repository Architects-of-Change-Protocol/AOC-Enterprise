import * as React from 'react';
import type { EnforcementViolationRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface ViolationsTableProps {
  readonly violations: readonly EnforcementViolationRow[];
}

export function ViolationsTable({ violations }: ViolationsTableProps): React.ReactElement {
  if (violations.length === 0) {
    return <AocEmptyState message="No open violations." />;
  }
  return (
    <table className="aoc-table" aria-label="Enforcement violations">
      <thead>
        <tr>
          <th scope="col">Violation</th>
          <th scope="col">Type</th>
          <th scope="col">Severity</th>
          <th scope="col">Reason</th>
          <th scope="col">Detected</th>
        </tr>
      </thead>
      <tbody>
        {violations.map((violation) => (
          <tr key={violation.id}>
            <th scope="row">{violation.id}</th>
            <td>{violation.type}</td>
            <td>{violation.severity}</td>
            <td>{violation.reason}</td>
            <td>{violation.detectedAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
