import * as React from 'react';
import type { PolicyEvidenceRequirementRow } from '../../domain/policy-pack-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface PolicyEvidenceRequirementsListProps {
  readonly evidenceRequirements: readonly PolicyEvidenceRequirementRow[];
}

export function PolicyEvidenceRequirementsList({ evidenceRequirements }: PolicyEvidenceRequirementsListProps): React.ReactElement {
  if (evidenceRequirements.length === 0) {
    return <AocEmptyState message="No evidence requirements." />;
  }
  return (
    <ul className="aoc-policy-evidence-requirements-list">
      {evidenceRequirements.map((requirement) => (
        <li key={requirement.id}>
          <strong>{requirement.type.replace(/_/g, ' ')}</strong> — {requirement.description}{' '}
          <span className={`aoc-badge aoc-badge--${requirement.required ? 'warning' : 'neutral'}`} role="status">
            {requirement.required ? 'required' : 'optional'}
          </span>
          {requirement.sourceRuleId !== undefined ? <span className="aoc-policy-evidence-requirements-list__source"> (rule {requirement.sourceRuleId})</span> : null}
        </li>
      ))}
    </ul>
  );
}
