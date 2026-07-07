import * as React from 'react';
import type { DemoProofChain } from '../domain/demo-proof-chain.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoProofChainPanelProps {
  readonly proofChain?: DemoProofChain;
}

export function DemoProofChainPanel({ proofChain }: DemoProofChainPanelProps): React.ReactElement {
  if (proofChain === undefined) {
    return <DemoEmptyState message="No proof chain has been extracted for this scenario yet." />;
  }

  return (
    <div className="aoc-demo-proof-chain-panel">
      <p className={proofChain.complete ? 'aoc-demo-proof-chain-panel__badge aoc-demo-proof-chain-panel__badge--complete' : 'aoc-demo-proof-chain-panel__badge aoc-demo-proof-chain-panel__badge--incomplete'}>
        {proofChain.complete ? 'Complete' : 'Incomplete'}
      </p>
      <section>
        <h4>Sources</h4>
        <ul>
          {proofChain.sources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      </section>
      {proofChain.missingSources.length > 0 ? (
        <section>
          <h4>Missing sources</h4>
          <ul>
            {proofChain.missingSources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h4>Proof ids</h4>
        <ul>
          {proofChain.proofIds.map((proofId) => (
            <li key={proofId}>{proofId}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Proof hashes</h4>
        <ul>
          {proofChain.proofHashes.map((hash) => (
            <li key={hash}>{hash}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
