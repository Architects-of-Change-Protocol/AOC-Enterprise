import * as React from 'react';
import type { ApprovalDecisionRow } from '../../domain/control-plane-view-model.js';
import { AocDecisionBadge } from '../AocDecisionBadge.js';
import { ApprovalEvidenceList } from './ApprovalEvidenceList.js';

export interface ApprovalDecisionDetailProps {
  readonly decision: ApprovalDecisionRow;
}

const STATUS_BY_TYPE: Record<string, 'approved' | 'rejected' | 'requires_attention' | 'expired' | 'revoked' | 'blocked'> = {
  approved: 'approved',
  rejected: 'rejected',
  requested_changes: 'requires_attention',
  escalated: 'requires_attention',
  expired: 'expired',
  revoked: 'revoked',
};

export function ApprovalDecisionDetail({ decision }: ApprovalDecisionDetailProps): React.ReactElement {
  return (
    <div aria-label={`Approval decision ${decision.id}`}>
      <dl className="aoc-detail">
        <dt>Status</dt>
        <dd>
          <AocDecisionBadge status={STATUS_BY_TYPE[decision.type] ?? 'blocked'} label={decision.type} />
        </dd>
        {decision.approverActorId !== undefined ? (
          <>
            <dt>Approver</dt>
            <dd>{decision.approverActorId}</dd>
          </>
        ) : null}
        <dt>Reason code</dt>
        <dd>{decision.reasonCode}</dd>
        {decision.reason !== undefined ? (
          <>
            <dt>Reason</dt>
            <dd>{decision.reason}</dd>
          </>
        ) : null}
        <dt>Decided at</dt>
        <dd>{decision.decidedAt}</dd>
      </dl>
      <h4>Evidence reviewed</h4>
      <ApprovalEvidenceList evidence={decision.evidenceReviewed} />
    </div>
  );
}
