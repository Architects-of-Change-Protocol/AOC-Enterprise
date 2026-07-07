import * as React from 'react';
import type { SideEffectRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface SideEffectsTableProps {
  readonly sideEffects: readonly SideEffectRow[];
}

export function SideEffectsTable({ sideEffects }: SideEffectsTableProps): React.ReactElement {
  if (sideEffects.length === 0) {
    return <AocEmptyState message="No side effects planned." />;
  }
  return (
    <table className="aoc-table" aria-label="Side effects">
      <thead>
        <tr>
          <th scope="col">Side effect</th>
          <th scope="col">Type</th>
          <th scope="col">Status</th>
          <th scope="col">Description</th>
          <th scope="col">Planned</th>
          <th scope="col">Executed</th>
        </tr>
      </thead>
      <tbody>
        {sideEffects.map((sideEffect) => (
          <tr key={sideEffect.id}>
            <th scope="row">{sideEffect.id}</th>
            <td>{sideEffect.type}</td>
            <td>{sideEffect.status}</td>
            <td>{sideEffect.description ?? '—'}</td>
            <td>{sideEffect.plannedAt}</td>
            <td>{sideEffect.executedAt ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
