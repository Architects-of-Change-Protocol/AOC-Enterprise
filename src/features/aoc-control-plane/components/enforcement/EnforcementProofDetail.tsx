import * as React from 'react';
import type { EnforcementProofRow } from '../../domain/control-plane-view-model.js';

export interface EnforcementProofDetailProps {
  readonly proof: EnforcementProofRow;
}

export function EnforcementProofDetail({ proof }: EnforcementProofDetailProps): React.ReactElement {
  return (
    <dl className="aoc-detail" aria-label={`Enforcement proof ${proof.id}`}>
      <dt>Proof</dt>
      <dd>
        <code title={proof.proofHash}>{proof.proofHash.slice(0, 16)}…</code>
      </dd>
      <dt>Allowed to execute</dt>
      <dd>{proof.allowedToExecute ? 'Yes' : 'No'}</dd>
      <dt>Executed</dt>
      <dd>{proof.executed ? 'Yes' : 'No'}</dd>
      {proof.recognitionDecisionId !== undefined ? (
        <>
          <dt>Recognition decision</dt>
          <dd>{proof.recognitionDecisionId}</dd>
        </>
      ) : null}
      {proof.authorityProofId !== undefined ? (
        <>
          <dt>Authority proof</dt>
          <dd>{proof.authorityProofId}</dd>
        </>
      ) : null}
      {proof.approvalProofId !== undefined ? (
        <>
          <dt>Approval proof</dt>
          <dd>{proof.approvalProofId}</dd>
        </>
      ) : null}
      {proof.handshakeProofId !== undefined ? (
        <>
          <dt>Handshake proof</dt>
          <dd>{proof.handshakeProofId}</dd>
        </>
      ) : null}
      <dt>Created at</dt>
      <dd>{proof.createdAt}</dd>
    </dl>
  );
}
