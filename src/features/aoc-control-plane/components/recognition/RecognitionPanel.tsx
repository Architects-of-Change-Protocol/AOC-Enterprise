import * as React from 'react';
import type { RecognitionViewModel, RecognitionDecisionRow } from '../../domain/control-plane-view-model.js';
import { RecognizedActorsTable } from './RecognizedActorsTable.js';
import { PassportsTable } from './PassportsTable.js';
import { CapabilityTokensTable } from './CapabilityTokensTable.js';
import { RecognitionDecisionsTable } from './RecognitionDecisionsTable.js';
import { RecognitionDecisionDetail } from './RecognitionDecisionDetail.js';
import { AuditEventsTable } from './AuditEventsTable.js';

export interface RecognitionPanelProps {
  readonly recognition: RecognitionViewModel;
}

export function RecognitionPanel({ recognition }: RecognitionPanelProps): React.ReactElement {
  const [selectedDecision, setSelectedDecision] = React.useState<RecognitionDecisionRow | undefined>(undefined);

  return (
    <section className="aoc-panel" aria-label="Recognition">
      <h2>Recognition</h2>

      <h3>Recognized actors</h3>
      <RecognizedActorsTable actors={recognition.actors} />

      <h3>Passports</h3>
      <PassportsTable passports={recognition.passports} />

      <h3>Capability tokens</h3>
      <CapabilityTokensTable tokens={recognition.capabilityTokens} />

      <h3>Recognition decisions</h3>
      <RecognitionDecisionsTable decisions={recognition.decisions} onSelect={setSelectedDecision} />
      {selectedDecision !== undefined ? <RecognitionDecisionDetail decision={selectedDecision} /> : null}

      <h3>Audit events</h3>
      <AuditEventsTable events={recognition.auditEvents} />
    </section>
  );
}
