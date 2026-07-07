import * as React from 'react';
import type { RecognizedActorRow } from '../../domain/control-plane-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface RecognizedActorsTableProps {
  readonly actors: readonly RecognizedActorRow[];
}

export function RecognizedActorsTable({ actors }: RecognizedActorsTableProps): React.ReactElement {
  if (actors.length === 0) {
    return <AocEmptyState message="No recognized actors." />;
  }
  return (
    <table className="aoc-table" aria-label="Recognized actors">
      <thead>
        <tr>
          <th scope="col">Actor</th>
          <th scope="col">Type</th>
          <th scope="col">Status</th>
          <th scope="col">Trust domain</th>
          <th scope="col">Registered</th>
        </tr>
      </thead>
      <tbody>
        {actors.map((actor) => (
          <tr key={actor.id}>
            <th scope="row">{actor.displayName ?? actor.id}</th>
            <td>{actor.type}</td>
            <td>{actor.status}</td>
            <td>{actor.trustDomainId}</td>
            <td>{actor.createdAt ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
