import * as React from 'react';
import type { ApprovalViewModel, ApprovalRequestRow } from '../../domain/control-plane-view-model.js';
import { ApprovalRequestsTable } from './ApprovalRequestsTable.js';
import { ApprovalDecisionDetail } from './ApprovalDecisionDetail.js';
import { ApprovalProofDetail } from './ApprovalProofDetail.js';
import { ApprovalActionBar } from './ApprovalActionBar.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface ApprovalCommandHandlers {
  readonly onApprove?: ((requestId: string) => void) | undefined;
  readonly onReject?: ((requestId: string) => void) | undefined;
  readonly onRequestChanges?: ((requestId: string) => void) | undefined;
  readonly onEscalate?: ((requestId: string) => void) | undefined;
}

export interface ApprovalPanelProps {
  readonly approvals: ApprovalViewModel;
  readonly commands?: ApprovalCommandHandlers;
}

export function ApprovalPanel({ approvals, commands }: ApprovalPanelProps): React.ReactElement {
  const [selectedRequest, setSelectedRequest] = React.useState<ApprovalRequestRow | undefined>(undefined);

  const decisionForSelected =
    selectedRequest !== undefined ? approvals.decisions.find((decision) => decision.approvalRequestId === selectedRequest.id) : undefined;
  const proofForSelected =
    selectedRequest !== undefined ? approvals.proofs.find((proof) => proof.approvalRequestId === selectedRequest.id) : undefined;

  return (
    <section className="aoc-panel" aria-label="Approvals">
      <h2>Approvals</h2>
      <p>{approvals.pendingCount} pending approval(s).</p>

      <ApprovalRequestsTable requests={approvals.requests} onSelect={setSelectedRequest} />

      {selectedRequest !== undefined ? (
        <div className="aoc-approval-detail">
          <h3>Selected request: {selectedRequest.id}</h3>
          <ApprovalActionBar
            disabled={selectedRequest.status !== 'pending'}
            onApprove={commands?.onApprove ? () => commands.onApprove?.(selectedRequest.id) : undefined}
            onReject={commands?.onReject ? () => commands.onReject?.(selectedRequest.id) : undefined}
            onRequestChanges={commands?.onRequestChanges ? () => commands.onRequestChanges?.(selectedRequest.id) : undefined}
            onEscalate={commands?.onEscalate ? () => commands.onEscalate?.(selectedRequest.id) : undefined}
          />
          {decisionForSelected !== undefined ? (
            <ApprovalDecisionDetail decision={decisionForSelected} />
          ) : (
            <AocEmptyState message="No decision recorded yet for this request." />
          )}
          {proofForSelected !== undefined ? <ApprovalProofDetail proof={proofForSelected} /> : null}
        </div>
      ) : null}
    </section>
  );
}
