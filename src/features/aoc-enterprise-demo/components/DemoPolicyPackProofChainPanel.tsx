import * as React from 'react';
import type { DemoPolicyPackControlPlaneSnapshot } from '../domain/demo-policy-pack.js';
import type { DemoScenarioOutcome } from '../domain/demo-outcome.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoPolicyPackProofChainPanelProps {
  readonly snapshot?: DemoPolicyPackControlPlaneSnapshot;
  readonly outcome?: DemoScenarioOutcome;
}

export function DemoPolicyPackProofChainPanel({ snapshot, outcome }: DemoPolicyPackProofChainPanelProps): React.ReactElement {
  if (snapshot === undefined) {
    return <DemoEmptyState message="No policy proof chain has been extracted for this scenario yet." />;
  }

  return (
    <div className="aoc-demo-policy-pack-proof-chain-panel">
      <p
        className={
          snapshot.policyProofChainComplete
            ? 'aoc-demo-policy-pack-proof-chain-panel__badge aoc-demo-policy-pack-proof-chain-panel__badge--complete'
            : 'aoc-demo-policy-pack-proof-chain-panel__badge aoc-demo-policy-pack-proof-chain-panel__badge--incomplete'
        }
        data-testid="policy-proof-chain-status"
      >
        {snapshot.policyProofChainComplete ? 'Complete' : 'Incomplete'}
      </p>
      <section>
        <h4>Enforcement proof</h4>
        <p data-testid="policy-proof-chain-enforcement-proof">
          {outcome?.enforcementDecisionId ?? 'none'}
          {outcome?.proofHash !== undefined ? ` (${outcome.proofHash})` : ''}
        </p>
      </section>
      <section>
        <h4>Policy proof</h4>
        <p data-testid="policy-proof-chain-policy-proof">{snapshot.highlightedProofId ?? 'none'}</p>
      </section>
      <section>
        <h4>Policy pack version</h4>
        <ul>
          {snapshot.highlightedVersionIds.length > 0 ? (
            snapshot.highlightedVersionIds.map((versionId) => (
              <li key={versionId} data-testid="policy-proof-chain-version">
                {versionId}
              </li>
            ))
          ) : (
            <li>none</li>
          )}
        </ul>
      </section>
      <section>
        <h4>Matched rules</h4>
        <ul>
          {snapshot.highlightedRuleIds.length > 0 ? (
            snapshot.highlightedRuleIds.map((ruleId) => (
              <li key={ruleId} data-testid="policy-proof-chain-rule">
                {ruleId}
              </li>
            ))
          ) : (
            <li>none</li>
          )}
        </ul>
      </section>
    </div>
  );
}
