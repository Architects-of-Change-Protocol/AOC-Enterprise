import * as React from 'react';
import type { PolicyApprovalRequirementRow } from '../../domain/policy-pack-view-model.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface PolicyApprovalRequirementsListProps {
  readonly approvalRequirements: readonly PolicyApprovalRequirementRow[];
}

export function PolicyApprovalRequirementsList({ approvalRequirements }: PolicyApprovalRequirementsListProps): React.ReactElement {
  if (approvalRequirements.length === 0) {
    return <AocEmptyState message="No approval requirements." />;
  }
  return (
    <ul className="aoc-policy-approval-requirements-list">
      {approvalRequirements.map((requirement) => (
        <li key={requirement.id}>
          <strong>{requirement.type.replace(/_/g, ' ')}</strong> — {requirement.description}{' '}
          <span className={`aoc-badge aoc-badge--${requirement.required ? 'warning' : 'neutral'}`} role="status">
            {requirement.required ? 'required' : 'optional'}
          </span>
          <span> minimum approvals: {requirement.minimumApprovals}</span>
          <span> segregation of duties: {requirement.requiresSegregationOfDuties ? 'yes' : 'no'}</span>
          {requirement.requiredAuthorityCapability !== undefined ? <span> capability: {requirement.requiredAuthorityCapability}</span> : null}
          {requirement.sourceRuleId !== undefined ? <span className="aoc-policy-approval-requirements-list__source"> (rule {requirement.sourceRuleId})</span> : null}
        </li>
      ))}
    </ul>
  );
}
