import * as React from 'react';
import type { PolicyEvaluationRow } from '../../domain/policy-pack-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';
import { PolicyDecisionBadge } from './PolicyDecisionBadge.js';

export interface PolicyEvaluationsTableProps {
  readonly evaluations: readonly PolicyEvaluationRow[];
  readonly onSelect?: ((evaluation: PolicyEvaluationRow) => void) | undefined;
}

export function PolicyEvaluationsTable({ evaluations, onSelect }: PolicyEvaluationsTableProps): React.ReactElement {
  if (evaluations.length === 0) {
    return <AocEmptyState message="No policy evaluations recorded." />;
  }
  return (
    <table className="aoc-table" aria-label="Policy evaluations">
      <thead>
        <tr>
          <th scope="col">Evaluated At</th>
          <th scope="col">Actor</th>
          <th scope="col">Action</th>
          <th scope="col">Resource Scope</th>
          <th scope="col">Domain</th>
          <th scope="col">Jurisdiction</th>
          <th scope="col">Decision</th>
          <th scope="col">Effective Risk</th>
          <th scope="col">Matched Rules</th>
          <th scope="col">Proof</th>
        </tr>
      </thead>
      <tbody>
        {evaluations.map((evaluation) => (
          <tr key={evaluation.id}>
            <th scope="row">
              {onSelect ? (
                <button type="button" onClick={() => onSelect(evaluation)}>
                  {evaluation.evaluatedAt}
                </button>
              ) : (
                evaluation.evaluatedAt
              )}
            </th>
            <td>{evaluation.actorId}</td>
            <td>{evaluation.action}</td>
            <td>{evaluation.resourceScope}</td>
            <td>{evaluation.domain ?? '—'}</td>
            <td>{evaluation.jurisdiction ?? '—'}</td>
            <td>
              <PolicyDecisionBadge type={evaluation.decisionType} />
            </td>
            <td>{evaluation.effectiveRiskLevel}</td>
            <td>{evaluation.matchedRuleIds.length > 0 ? evaluation.matchedRuleIds.join(', ') : '—'}</td>
            <td>{evaluation.policyProofHash !== undefined ? <code title={evaluation.policyProofHash}>{evaluation.policyProofHash.slice(0, 12)}…</code> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
