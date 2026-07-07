import * as React from 'react';
import type { DemoScenarioOutcome } from '../domain/demo-outcome.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoOutcomePanelProps {
  readonly outcome?: DemoScenarioOutcome;
}

export function DemoOutcomePanel({ outcome }: DemoOutcomePanelProps): React.ReactElement {
  if (outcome === undefined) {
    return <DemoEmptyState message="This scenario has not produced an outcome yet." />;
  }

  return (
    <dl className="aoc-demo-outcome-panel">
      <dt>Status</dt>
      <dd data-testid="outcome-status">{outcome.status}</dd>
      <dt>Reason code</dt>
      <dd>{outcome.reasonCode}</dd>
      <dt>Reason</dt>
      <dd>{outcome.reason}</dd>
      <dt>Executor ran</dt>
      <dd>{String(outcome.executorRan)}</dd>
      <dt>Side effects executed</dt>
      <dd>{String(outcome.sideEffectsExecuted)}</dd>
      {outcome.enforcementDecisionId !== undefined ? (
        <>
          <dt>Enforcement decision id</dt>
          <dd>{outcome.enforcementDecisionId}</dd>
        </>
      ) : null}
      {outcome.proofHash !== undefined ? (
        <>
          <dt>Proof hash</dt>
          <dd>{outcome.proofHash}</dd>
        </>
      ) : null}
    </dl>
  );
}
