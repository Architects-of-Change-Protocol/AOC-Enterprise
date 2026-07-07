import * as React from 'react';

export interface AocProofLinkProps {
  readonly proofId?: string | undefined;
  readonly proofHash?: string | undefined;
  readonly onSelect?: ((proofId: string) => void) | undefined;
}

/** Displays a shortened proof hash. Never claims a proof exists unless a hash was actually supplied by the read model. */
export function AocProofLink({ proofId, proofHash, onSelect }: AocProofLinkProps): React.ReactElement {
  if (proofHash === undefined) {
    return <span className="aoc-proof-link aoc-proof-link--none">No proof</span>;
  }
  const short = `${proofHash.slice(0, 10)}…`;
  if (proofId === undefined || onSelect === undefined) {
    return (
      <code className="aoc-proof-link" title={proofHash}>
        {short}
      </code>
    );
  }
  return (
    <button type="button" className="aoc-proof-link aoc-proof-link--button" title={proofHash} onClick={() => onSelect(proofId)}>
      {short}
    </button>
  );
}
