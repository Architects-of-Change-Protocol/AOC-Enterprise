import * as React from 'react';
import type { PolicyRuleRow } from '../../domain/policy-pack-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';
import { PolicyEffectBadge } from './PolicyEffectBadge.js';

export interface PolicyRulesTableProps {
  readonly rules: readonly PolicyRuleRow[];
  readonly onSelect?: ((rule: PolicyRuleRow) => void) | undefined;
}

export function PolicyRulesTable({ rules, onSelect }: PolicyRulesTableProps): React.ReactElement {
  if (rules.length === 0) {
    return <AocEmptyState message="No policy rules registered." />;
  }
  return (
    <table className="aoc-table" aria-label="Policy rules">
      <thead>
        <tr>
          <th scope="col">Priority</th>
          <th scope="col">Rule</th>
          <th scope="col">Effect</th>
          <th scope="col">Severity</th>
          <th scope="col">Reason Code</th>
          <th scope="col">Obligations</th>
          <th scope="col">Evidence Requirements</th>
          <th scope="col">Approval Requirements</th>
          <th scope="col">Sources</th>
        </tr>
      </thead>
      <tbody>
        {rules.map((rule) => (
          <tr key={rule.id}>
            <td>{rule.priority}</td>
            <th scope="row">
              {onSelect ? (
                <button type="button" onClick={() => onSelect(rule)}>
                  {rule.name}
                </button>
              ) : (
                rule.name
              )}
            </th>
            <td>
              <PolicyEffectBadge effectType={rule.effectType} />
            </td>
            <td>{rule.severity}</td>
            <td>{rule.reasonCode}</td>
            <td>{rule.obligationCount}</td>
            <td>{rule.evidenceRequirementCount}</td>
            <td>{rule.approvalRequirementCount}</td>
            <td>{rule.sourceIds.length > 0 ? rule.sourceIds.join(', ') : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
