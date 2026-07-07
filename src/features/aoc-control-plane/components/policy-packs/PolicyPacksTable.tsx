import * as React from 'react';
import type { PolicyPackRow } from '../../domain/policy-pack-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';
import { PolicyDemoOnlyBadge } from './PolicyDemoOnlyBadge.js';
import { PolicyLegalCompletenessBadge } from './PolicyLegalCompletenessBadge.js';

export interface PolicyPacksTableProps {
  readonly packs: readonly PolicyPackRow[];
  readonly onSelect?: ((pack: PolicyPackRow) => void) | undefined;
}

export function PolicyPacksTable({ packs, onSelect }: PolicyPacksTableProps): React.ReactElement {
  if (packs.length === 0) {
    return <AocEmptyState message="No policy packs registered." />;
  }
  return (
    <table className="aoc-table" aria-label="Policy packs">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Kind</th>
          <th scope="col">Domain</th>
          <th scope="col">Status</th>
          <th scope="col">Current Version</th>
          <th scope="col">Demo Only</th>
          <th scope="col">Legal Completeness</th>
          <th scope="col">Versions</th>
          <th scope="col">Updated At</th>
        </tr>
      </thead>
      <tbody>
        {packs.map((pack) => (
          <tr key={pack.id}>
            <th scope="row">
              {onSelect ? (
                <button type="button" onClick={() => onSelect(pack)}>
                  {pack.name}
                </button>
              ) : (
                pack.name
              )}
            </th>
            <td>{pack.kind}</td>
            <td>{pack.domain}</td>
            <td>{pack.status}</td>
            <td>{pack.currentVersionId}</td>
            <td>
              <PolicyDemoOnlyBadge demoOnly={pack.demoOnly} />
            </td>
            <td>
              <PolicyLegalCompletenessBadge legalCompleteness={pack.legalCompleteness} />
            </td>
            <td>
              {pack.activeVersionCount} active / {pack.versionCount} total
            </td>
            <td>{pack.updatedAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
