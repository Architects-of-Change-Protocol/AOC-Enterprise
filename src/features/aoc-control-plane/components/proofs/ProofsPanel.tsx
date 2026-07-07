import * as React from 'react';
import type { ProofsViewModel } from '../../domain/control-plane-view-model.js';
import type { AuditEventRow } from '../../domain/control-plane-view-model.js';
import type { ProofReferenceRow } from '../../domain/control-plane-proof-reference.js';
import { ProofReferencesList } from './ProofReferencesList.js';
import { ProofChainViewer } from './ProofChainViewer.js';
import { ProofHashDisplay } from './ProofHashDisplay.js';
import { AuditTrailTable } from './AuditTrailTable.js';

export interface ProofsPanelProps {
  readonly proofs: ProofsViewModel;
  readonly auditEvents: readonly AuditEventRow[];
}

export function ProofsPanel({ proofs, auditEvents }: ProofsPanelProps): React.ReactElement {
  const [selectedProof, setSelectedProof] = React.useState<ProofReferenceRow | undefined>(undefined);

  return (
    <section className="aoc-panel" aria-label="Proofs / Audit">
      <h2>Proofs / Audit</h2>

      <h3>Proof chains</h3>
      <ProofChainViewer proofChains={proofs.proofChains} />

      {selectedProof !== undefined ? (
        <div>
          <h3>Selected proof: {selectedProof.id}</h3>
          <ProofHashDisplay proofHash={selectedProof.proofHash} previousHash={selectedProof.previousHash} />
        </div>
      ) : null}

      <ProofReferencesList title="Recognition proofs" proofs={proofs.recognitionProofs} onSelect={setSelectedProof} />
      <ProofReferencesList title="Authority proofs" proofs={proofs.authorityProofs} onSelect={setSelectedProof} />
      <ProofReferencesList title="Approval proofs" proofs={proofs.approvalProofs} onSelect={setSelectedProof} />
      <ProofReferencesList title="Handshake proofs" proofs={proofs.handshakeProofs} onSelect={setSelectedProof} />
      <ProofReferencesList title="Enforcement proofs" proofs={proofs.enforcementProofs} onSelect={setSelectedProof} />
      <ProofReferencesList title="Policy proofs" proofs={proofs.policyProofs} onSelect={setSelectedProof} />

      <h3>Audit trail</h3>
      <AuditTrailTable auditEvents={auditEvents} />
    </section>
  );
}
