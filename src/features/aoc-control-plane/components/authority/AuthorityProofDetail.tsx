import * as React from 'react';
import type { AuthorityProofRow } from '../../domain/control-plane-view-model.js';

export interface AuthorityProofDetailProps {
  readonly proof: AuthorityProofRow;
}

export function AuthorityProofDetail({ proof }: AuthorityProofDetailProps): React.ReactElement {
  return (
    <dl className="aoc-detail" aria-label={`Authority proof ${proof.id}`}>
      <dt>Proof</dt>
      <dd>
        <code title={proof.proofHash}>{proof.proofHash.slice(0, 16)}…</code>
      </dd>
      <dt>Decision type</dt>
      <dd>{proof.decisionType}</dd>
      <dt>Valid</dt>
      <dd>{proof.valid ? 'Yes' : 'No'}</dd>
      {proof.previousHash !== undefined ? (
        <>
          <dt>Previous hash</dt>
          <dd>
            <code title={proof.previousHash}>{proof.previousHash.slice(0, 16)}…</code>
          </dd>
        </>
      ) : null}
      <dt>Created at</dt>
      <dd>{proof.createdAt}</dd>
    </dl>
  );
}
