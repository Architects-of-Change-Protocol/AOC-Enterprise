import * as React from 'react';
import type { PolicyPackVersionRow } from '../../domain/policy-pack-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';
import { PolicyDemoOnlyBadge } from './PolicyDemoOnlyBadge.js';
import { PolicyLegalCompletenessBadge } from './PolicyLegalCompletenessBadge.js';

export interface PolicyPackVersionsTableProps {
  readonly versions: readonly PolicyPackVersionRow[];
  readonly onSelect?: ((version: PolicyPackVersionRow) => void) | undefined;
}

export function PolicyPackVersionsTable({ versions, onSelect }: PolicyPackVersionsTableProps): React.ReactElement {
  if (versions.length === 0) {
    return <AocEmptyState message="No policy pack versions registered." />;
  }
  return (
    <table className="aoc-table" aria-label="Policy pack versions">
      <thead>
        <tr>
          <th scope="col">Pack</th>
          <th scope="col">Version</th>
          <th scope="col">Status</th>
          <th scope="col">Demo Only</th>
          <th scope="col">Legal Completeness</th>
          <th scope="col">Rules</th>
          <th scope="col">Scope</th>
          <th scope="col">Effective From</th>
          <th scope="col">Effective Until</th>
        </tr>
      </thead>
      <tbody>
        {versions.map((version) => (
          <tr key={version.id}>
            <th scope="row">
              {onSelect ? (
                <button type="button" onClick={() => onSelect(version)}>
                  {version.policyPackName}
                </button>
              ) : (
                version.policyPackName
              )}
            </th>
            <td>{version.version}</td>
            <td>{version.status}</td>
            <td>
              <PolicyDemoOnlyBadge demoOnly={version.demoOnly} />
            </td>
            <td>
              <PolicyLegalCompletenessBadge legalCompleteness={version.legalCompleteness} />
            </td>
            <td>{version.ruleCount}</td>
            <td>{version.scopeSummary}</td>
            <td>{version.effectiveFrom}</td>
            <td>{version.effectiveUntil ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
