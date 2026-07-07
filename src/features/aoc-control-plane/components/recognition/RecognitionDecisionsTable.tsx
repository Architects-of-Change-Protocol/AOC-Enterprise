import * as React from 'react';
import type { RecognitionDecisionRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface RecognitionDecisionsTableProps {
  readonly decisions: readonly RecognitionDecisionRow[];
  readonly onSelect?: (decision: RecognitionDecisionRow) => void;
}

export function RecognitionDecisionsTable({ decisions, onSelect }: RecognitionDecisionsTableProps): React.ReactElement {
  if (decisions.length === 0) {
    return <AocEmptyState message="No recognition decisions recorded." />;
  }
  return (
    <table className="aoc-table" aria-label="Recognition decisions">
      <thead>
        <tr>
          <th scope="col">Decision</th>
          <th scope="col">Type</th>
          <th scope="col">Actor</th>
          <th scope="col">Reason code</th>
          <th scope="col">Evaluated</th>
        </tr>
      </thead>
      <tbody>
        {decisions.map((decision) => (
          <tr key={decision.id}>
            <th scope="row">
              {onSelect ? (
                <button type="button" onClick={() => onSelect(decision)}>
                  {decision.id}
                </button>
              ) : (
                decision.id
              )}
            </th>
            <td>{decision.type}</td>
            <td>{decision.actorId}</td>
            <td>{decision.reasonCode}</td>
            <td>{decision.evaluatedAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
