import * as React from 'react';
import type { DemoControlPlaneSnapshot } from '../domain/demo-control-plane-snapshot.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoControlPlaneSnapshotPanelProps {
  readonly snapshot?: DemoControlPlaneSnapshot;
}

export function DemoControlPlaneSnapshotPanel({ snapshot }: DemoControlPlaneSnapshotPanelProps): React.ReactElement {
  if (snapshot === undefined) {
    return <DemoEmptyState message="No Control Plane snapshot has been captured for this scenario yet." />;
  }

  return (
    <div className="aoc-demo-control-plane-snapshot-panel">
      <section>
        <h4>Relevant panels</h4>
        <ul>
          {snapshot.visiblePanelIds.map((panel) => (
            <li key={panel}>{panel}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Highlighted rows</h4>
        {snapshot.highlightedRows.length === 0 ? (
          <DemoEmptyState message="No rows are highlighted for this scenario." />
        ) : (
          <table className="aoc-table" aria-label="Highlighted Control Plane rows">
            <thead>
              <tr>
                <th scope="col">Panel</th>
                <th scope="col">Row</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.highlightedRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.panel}</td>
                  <td>{row.rowId}</td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section>
        <h4>Timeline items</h4>
        <ul>
          {snapshot.timelineItemIds.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
