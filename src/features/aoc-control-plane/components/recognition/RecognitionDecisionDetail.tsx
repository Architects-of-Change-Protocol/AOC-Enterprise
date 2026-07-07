import * as React from 'react';
import type { RecognitionDecisionRow } from '../../domain/control-plane-view-model.js';
import { AocDecisionBadge } from '../AocDecisionBadge.js';

export interface RecognitionDecisionDetailProps {
  readonly decision: RecognitionDecisionRow;
}

const STATUS_BY_TYPE: Record<string, 'allowed' | 'blocked' | 'pending' | 'requires_attention'> = {
  allow: 'allowed',
  require_human_approval: 'requires_attention',
  require_more_evidence: 'requires_attention',
};

export function RecognitionDecisionDetail({ decision }: RecognitionDecisionDetailProps): React.ReactElement {
  const status = STATUS_BY_TYPE[decision.type] ?? 'blocked';
  return (
    <dl className="aoc-detail" aria-label={`Recognition decision ${decision.id}`}>
      <dt>Status</dt>
      <dd>
        <AocDecisionBadge status={status} label={decision.type} />
      </dd>
      <dt>Recognized</dt>
      <dd>{decision.recognized ? 'Yes' : 'No'}</dd>
      <dt>Actor</dt>
      <dd>{decision.actorId}</dd>
      <dt>Trust domain</dt>
      <dd>{decision.trustDomainId}</dd>
      <dt>Reason code</dt>
      <dd>{decision.reasonCode}</dd>
      {decision.reason !== undefined ? (
        <>
          <dt>Reason</dt>
          <dd>{decision.reason}</dd>
        </>
      ) : null}
      <dt>Evaluated at</dt>
      <dd>{decision.evaluatedAt}</dd>
      <dt>Audit event</dt>
      <dd>{decision.auditEventId}</dd>
    </dl>
  );
}
