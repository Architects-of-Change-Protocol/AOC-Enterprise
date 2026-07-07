import * as React from 'react';
import type { ApprovalRequestRow } from '../../domain/control-plane-view-model.js';

export interface ApprovalQuorumIndicatorProps {
  readonly request: ApprovalRequestRow;
}

export function ApprovalQuorumIndicator({ request }: ApprovalQuorumIndicatorProps): React.ReactElement {
  const met = request.currentApprovals >= request.minimumApprovals;
  return (
    <div className={`aoc-quorum-indicator aoc-quorum-indicator--${met ? 'met' : 'unmet'}`} role="status">
      <span aria-hidden="true">{met ? '✓' : '○'}</span>
      <span>
        {request.currentApprovals} / {request.minimumApprovals} approvals
      </span>
      {request.requiresSegregationOfDuties ? <span className="aoc-quorum-indicator__sod">Segregation of duties enforced</span> : null}
    </div>
  );
}
