import * as React from 'react';

export interface ProofHashDisplayProps {
  readonly proofHash: string;
  readonly previousHash?: string | undefined;
}

export function ProofHashDisplay({ proofHash, previousHash }: ProofHashDisplayProps): React.ReactElement {
  return (
    <div className="aoc-proof-hash-display">
      <dl className="aoc-detail">
        <dt>Hash</dt>
        <dd>
          <code title={proofHash}>{proofHash}</code>
        </dd>
        <dt>Previous hash</dt>
        <dd>{previousHash !== undefined ? <code title={previousHash}>{previousHash}</code> : <span>None (chain start)</span>}</dd>
      </dl>
    </div>
  );
}
