import * as React from 'react';
import type { ApprovalEvidenceItemRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface ApprovalEvidenceListProps {
  readonly evidence: readonly ApprovalEvidenceItemRow[];
}

export function ApprovalEvidenceList({ evidence }: ApprovalEvidenceListProps): React.ReactElement {
  if (evidence.length === 0) {
    return <AocEmptyState message="No evidence was reviewed for this decision." />;
  }
  return (
    <ul className="aoc-evidence-list" aria-label="Evidence reviewed">
      {evidence.map((item) => (
        <li key={item.id}>
          <strong>{item.type}</strong> provided by {item.providedByActorId}
          {item.description !== undefined ? <span> — {item.description}</span> : null}
        </li>
      ))}
    </ul>
  );
}
