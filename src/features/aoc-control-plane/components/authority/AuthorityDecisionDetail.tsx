import * as React from 'react';
import type { AuthorityDecisionRow } from '../../domain/control-plane-view-model.js';
import { AocDecisionBadge } from '../AocDecisionBadge.js';

export interface AuthorityDecisionDetailProps {
  readonly decision: AuthorityDecisionRow;
}

export function AuthorityDecisionDetail({ decision }: AuthorityDecisionDetailProps): React.ReactElement {
  return (
    <dl className="aoc-detail" aria-label={`Authority decision ${decision.id}`}>
      <dt>Status</dt>
      <dd>
        <AocDecisionBadge status={decision.valid ? 'allowed' : 'blocked'} label={decision.type} />
      </dd>
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
    </dl>
  );
}
