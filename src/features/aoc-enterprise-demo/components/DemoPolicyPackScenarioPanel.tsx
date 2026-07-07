import * as React from 'react';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoScenarioOutcome } from '../domain/demo-outcome.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoPolicyPackScenarioPanelProps {
  readonly scenario?: DemoScenario;
  readonly outcome?: DemoScenarioOutcome;
}

export function DemoPolicyPackScenarioPanel({ scenario, outcome }: DemoPolicyPackScenarioPanelProps): React.ReactElement {
  if (scenario === undefined) {
    return <DemoEmptyState message="No policy-pack scenario is selected." />;
  }

  const policyPackLabel = outcome?.policyPackVersionIds !== undefined && outcome.policyPackVersionIds.length > 0 ? outcome.policyPackVersionIds.join(', ') : 'not yet evaluated';

  return (
    <article className="aoc-demo-policy-pack-scenario-panel">
      <h2>{scenario.title}</h2>
      <section>
        <h3>Buyer pain</h3>
        <p data-testid="policy-scenario-buyer-pain">{scenario.buyerPain}</p>
      </section>
      <section>
        <h3>AOC value</h3>
        <p data-testid="policy-scenario-aoc-value">{scenario.aocValue}</p>
      </section>
      <dl className="aoc-demo-policy-pack-scenario-panel__facts">
        <dt>Policy pack version(s)</dt>
        <dd data-testid="policy-scenario-pack">{policyPackLabel}</dd>
        <dt>Action</dt>
        <dd>{scenario.action}</dd>
        <dt>Resource scope</dt>
        <dd>{scenario.resourceScope}</dd>
        <dt>Risk level</dt>
        <dd>{scenario.riskLevel}</dd>
        <dt>Expected policy result</dt>
        <dd data-testid="policy-scenario-expected-outcome">{scenario.expectedOutcome}</dd>
        {outcome !== undefined ? (
          <>
            <dt>Run outcome</dt>
            <dd data-testid="policy-scenario-run-outcome">{outcome.status}</dd>
          </>
        ) : null}
      </dl>
    </article>
  );
}
