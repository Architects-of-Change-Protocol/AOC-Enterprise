import * as React from 'react';
import type { ApprovalProofRow } from '../../domain/control-plane-view-model.js';

export interface ApprovalProofDetailProps {
  readonly proof: ApprovalProofRow;
}

export function ApprovalProofDetail({ proof }: ApprovalProofDetailProps): React.ReactElement {
  return (
    <dl className="aoc-detail" aria-label={`Approval proof ${proof.id}`}>
      <dt>Proof</dt>
      <dd>
        <code title={proof.proofHash}>{proof.proofHash.slice(0, 16)}…</code>
      </dd>
      <dt>Status</dt>
      <dd>{proof.status}</dd>
      <dt>Approved</dt>
      <dd>{proof.approved ? 'Yes' : 'No'}</dd>
      {proof.revokedAt !== undefined ? (
        <>
          <dt>Revoked at</dt>
          <dd>{proof.revokedAt}</dd>
        </>
      ) : null}
      <dt>Created at</dt>
      <dd>{proof.createdAt}</dd>
    </dl>
  );
}
