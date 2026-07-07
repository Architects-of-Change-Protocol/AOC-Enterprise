import * as React from 'react';
import type { EnforcementDecisionRow } from '../../domain/control-plane-view-model.js';
import { AocDecisionBadge } from '../AocDecisionBadge.js';

export interface EnforcementDecisionDetailProps {
  readonly decision: EnforcementDecisionRow;
}

/** Always shows the reasonCode/reason next to the badge -- an operator must never have to guess why an action was blocked or allowed. */
export function EnforcementDecisionDetail({ decision }: EnforcementDecisionDetailProps): React.ReactElement {
  return (
    <dl className="aoc-detail" aria-label={`Enforcement decision ${decision.id}`}>
      <dt>Status</dt>
      <dd>
        <AocDecisionBadge status={decision.allowedToExecute ? 'allowed' : 'blocked'} label={decision.type} />
      </dd>
      <dt>Reason code</dt>
      <dd>{decision.reasonCode}</dd>
      <dt>Reason</dt>
      <dd>{decision.reason}</dd>
      {decision.recognitionDecisionId !== undefined ? (
        <>
          <dt>Recognition decision</dt>
          <dd>{decision.recognitionDecisionId}</dd>
        </>
      ) : null}
      {decision.authorityProofId !== undefined ? (
        <>
          <dt>Authority proof</dt>
          <dd>
            <code>{decision.authorityProofId}</code>
          </dd>
        </>
      ) : null}
      {decision.approvalProofId !== undefined ? (
        <>
          <dt>Approval proof</dt>
          <dd>
            <code>{decision.approvalProofId}</code>
          </dd>
        </>
      ) : null}
      {decision.handshakeProofId !== undefined ? (
        <>
          <dt>Handshake proof</dt>
          <dd>
            <code>{decision.handshakeProofId}</code>
          </dd>
        </>
      ) : null}
      <dt>Decided at</dt>
      <dd>{decision.decidedAt}</dd>
    </dl>
  );
}
