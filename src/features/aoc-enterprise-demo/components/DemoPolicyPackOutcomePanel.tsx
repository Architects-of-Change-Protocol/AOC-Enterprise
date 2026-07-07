import * as React from 'react';
import type { DemoScenarioOutcome } from '../domain/demo-outcome.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoPolicyPackOutcomePanelProps {
  readonly outcome?: DemoScenarioOutcome;
}

export function DemoPolicyPackOutcomePanel({ outcome }: DemoPolicyPackOutcomePanelProps): React.ReactElement {
  if (outcome === undefined) {
    return <DemoEmptyState message="This policy-pack scenario has not produced an outcome yet." />;
  }

  return (
    <dl className="aoc-demo-policy-pack-outcome-panel">
      <dt>Enforcement status</dt>
      <dd data-testid="policy-outcome-status">{outcome.status}</dd>
      <dt>Reason code</dt>
      <dd>{outcome.reasonCode}</dd>
      <dt>Executor ran</dt>
      <dd data-testid="policy-outcome-executor-ran">{String(outcome.executorRan)}</dd>
      <dt>Side effects executed</dt>
      <dd>{String(outcome.sideEffectsExecuted)}</dd>
      {outcome.policyDecisionId !== undefined ? (
        <>
          <dt>Policy decision id</dt>
          <dd data-testid="policy-outcome-decision-id">{outcome.policyDecisionId}</dd>
        </>
      ) : null}
      {outcome.policyProofId !== undefined ? (
        <>
          <dt>Policy proof id</dt>
          <dd data-testid="policy-outcome-proof-id">{outcome.policyProofId}</dd>
        </>
      ) : null}
      {outcome.policyPackVersionIds !== undefined && outcome.policyPackVersionIds.length > 0 ? (
        <>
          <dt>Policy pack version ids</dt>
          <dd>{outcome.policyPackVersionIds.join(', ')}</dd>
        </>
      ) : null}
      {outcome.policyMatchedRuleIds !== undefined && outcome.policyMatchedRuleIds.length > 0 ? (
        <>
          <dt>Matched rule ids</dt>
          <dd data-testid="policy-outcome-matched-rules">{outcome.policyMatchedRuleIds.join(', ')}</dd>
        </>
      ) : null}
      {outcome.policyReasonCode !== undefined ? (
        <>
          <dt>Policy reason code</dt>
          <dd>{outcome.policyReasonCode}</dd>
        </>
      ) : null}
      {outcome.policyReason !== undefined ? (
        <>
          <dt>Policy reason</dt>
          <dd>{outcome.policyReason}</dd>
        </>
      ) : null}
    </dl>
  );
}
