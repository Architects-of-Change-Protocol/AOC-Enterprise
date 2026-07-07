import * as React from 'react';
import type { EnforcementViewModel, EnforcementRequestRow } from '../../domain/control-plane-view-model.js';
import { EnforcementRequestsTable } from './EnforcementRequestsTable.js';
import { EnforcementDecisionDetail } from './EnforcementDecisionDetail.js';
import { ExecutionResultsTable } from './ExecutionResultsTable.js';
import { SideEffectsTable } from './SideEffectsTable.js';
import { ViolationsTable } from './ViolationsTable.js';
import { EnforcementProofDetail } from './EnforcementProofDetail.js';
import { IdempotencyStatus } from './IdempotencyStatus.js';
import { AocEmptyState } from '../AocEmptyState.js';

export interface EnforcementPanelProps {
  readonly enforcement: EnforcementViewModel;
}

export function EnforcementPanel({ enforcement }: EnforcementPanelProps): React.ReactElement {
  const [selectedRequest, setSelectedRequest] = React.useState<EnforcementRequestRow | undefined>(undefined);

  const decisionForSelected =
    selectedRequest !== undefined ? enforcement.decisions.find((decision) => decision.enforcementRequestId === selectedRequest.id) : undefined;
  const proofForSelected =
    selectedRequest !== undefined ? enforcement.proofs.find((proof) => proof.enforcementRequestId === selectedRequest.id) : undefined;
  const sideEffectsForSelected =
    selectedRequest !== undefined ? enforcement.sideEffects.filter((sideEffect) => sideEffect.enforcementRequestId === selectedRequest.id) : [];
  const duplicateRequestIds = new Set(
    enforcement.decisions.filter((decision) => decision.type === 'duplicate_suppressed').map((decision) => decision.enforcementRequestId),
  );

  return (
    <section className="aoc-panel" aria-label="Enforcement">
      <h2>Enforcement</h2>

      <EnforcementRequestsTable requests={enforcement.requests} onSelect={setSelectedRequest} />

      {selectedRequest !== undefined ? (
        <div className="aoc-enforcement-detail">
          <h3>Selected request: {selectedRequest.id}</h3>
          <IdempotencyStatus request={selectedRequest} isDuplicate={duplicateRequestIds.has(selectedRequest.id)} />
          {decisionForSelected !== undefined ? (
            <EnforcementDecisionDetail decision={decisionForSelected} />
          ) : (
            <AocEmptyState message="No decision recorded yet for this request." />
          )}
          <h4>Side effects</h4>
          <SideEffectsTable sideEffects={sideEffectsForSelected} />
          {proofForSelected !== undefined ? <EnforcementProofDetail proof={proofForSelected} /> : null}
        </div>
      ) : null}

      <h3>Execution results</h3>
      <ExecutionResultsTable results={enforcement.results} />

      <h3>Violations</h3>
      <ViolationsTable violations={enforcement.violations} />
    </section>
  );
}
