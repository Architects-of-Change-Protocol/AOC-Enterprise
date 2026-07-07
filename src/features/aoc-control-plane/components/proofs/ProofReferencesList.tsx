import * as React from 'react';
import type { ProofReferenceRow } from '../../domain/control-plane-proof-reference.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface ProofReferencesListProps {
  readonly title: string;
  readonly proofs: readonly ProofReferenceRow[];
  readonly onSelect?: ((proof: ProofReferenceRow) => void) | undefined;
}

export function ProofReferencesList({ title, proofs, onSelect }: ProofReferencesListProps): React.ReactElement {
  return (
    <div className="aoc-proof-references-list">
      <h4>{title}</h4>
      {proofs.length === 0 ? (
        <AocEmptyState message="No proofs generated." />
      ) : (
        <table className="aoc-table" aria-label={title}>
          <thead>
            <tr>
              <th scope="col">Proof</th>
              <th scope="col">Hash</th>
              <th scope="col">Actor</th>
              <th scope="col">Created</th>
            </tr>
          </thead>
          <tbody>
            {proofs.map((proof) => (
              <tr key={proof.id}>
                <th scope="row">
                  {onSelect ? (
                    <button type="button" onClick={() => onSelect(proof)}>
                      {proof.id}
                    </button>
                  ) : (
                    proof.id
                  )}
                </th>
                <td>
                  <code title={proof.proofHash}>{proof.proofHash.slice(0, 10)}…</code>
                </td>
                <td>{proof.actorId ?? '—'}</td>
                <td>{proof.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
