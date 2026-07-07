import * as React from 'react';
import type { ProofChainRow } from '../../domain/control-plane-proof-reference.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface ProofChainViewerProps {
  readonly proofChains: readonly ProofChainRow[];
}

/** Never marks a chain complete unless every upstream proof id it references was actually found in the read model. */
export function ProofChainViewer({ proofChains }: ProofChainViewerProps): React.ReactElement {
  if (proofChains.length === 0) {
    return <AocEmptyState message="No proof chains available." />;
  }
  return (
    <ul className="aoc-proof-chain-viewer">
      {proofChains.map((chain) => (
        <li key={chain.id} className={`aoc-proof-chain-viewer__chain aoc-proof-chain-viewer__chain--${chain.complete ? 'complete' : 'incomplete'}`}>
          <p className="aoc-proof-chain-viewer__title">
            {chain.title} — <span role="status">{chain.complete ? 'complete' : 'incomplete'}</span>
          </p>
          <ol className="aoc-proof-chain-viewer__steps">
            {chain.sources.map((source, index) => (
              <li key={`${chain.id}-${index}`}>
                <span className="aoc-proof-chain-viewer__source">{source}</span>
                <code>{chain.proofIds[index]}</code>
                {index < chain.sources.length - 1 ? (
                  <span aria-hidden="true" className="aoc-proof-chain-viewer__arrow">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}
