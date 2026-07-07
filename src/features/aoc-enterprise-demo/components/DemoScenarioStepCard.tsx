import * as React from 'react';
import type { DemoStepRun } from '../domain/demo-step.js';

export interface DemoScenarioStepCardProps {
  readonly step: DemoStepRun;
}

export function DemoScenarioStepCard({ step }: DemoScenarioStepCardProps): React.ReactElement {
  return (
    <li className={`aoc-demo-step-card aoc-demo-step-card--${step.status}`}>
      <p className="aoc-demo-step-card__title">{step.title}</p>
      <p className="aoc-demo-step-card__kind">{step.kind}</p>
      <p className="aoc-demo-step-card__status">{step.status}</p>
      <p className="aoc-demo-step-card__summary">{step.summary}</p>
      {step.relatedEntityIds.length > 0 ? (
        <p className="aoc-demo-step-card__entities">Entities: {step.relatedEntityIds.join(', ')}</p>
      ) : null}
      {step.relatedProofIds.length > 0 ? <p className="aoc-demo-step-card__proofs">Proofs: {step.relatedProofIds.join(', ')}</p> : null}
    </li>
  );
}
