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
      {proof.policyDecisionId !== undefined ? (
        <>
          <dt>Policy decision</dt>
          <dd>{proof.policyDecisionId}</dd>
        </>
      ) : null}
      {proof.policyProofId !== undefined ? (
        <>
          <dt>Policy proof</dt>
          <dd>{proof.policyProofId}</dd>
        </>
      ) : null}
      {proof.policyPackVersionIds !== undefined ? (
        <>
          <dt>Policy pack versions</dt>
          <dd>{proof.policyPackVersionIds.length > 0 ? proof.policyPackVersionIds.join(', ') : '—'}</dd>
        </>
      ) : null}
      {proof.policyMatchedRuleIds !== undefined ? (
        <>
          <dt>Policy matched rules</dt>
          <dd>{proof.policyMatchedRuleIds.length > 0 ? proof.policyMatchedRuleIds.join(', ') : '—'}</dd>
        </>
      ) : null}
      <dt>Created at</dt>
      <dd>{proof.createdAt}</dd>
    </dl>
  );
}
