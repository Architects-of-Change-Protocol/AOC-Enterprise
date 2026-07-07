import * as React from 'react';
import type { DemoStepRun } from '../domain/demo-step.js';
import { DemoEmptyState } from './DemoEmptyState.js';
import { DemoScenarioStepCard } from './DemoScenarioStepCard.js';

export interface DemoScenarioTimelineProps {
  readonly steps: readonly DemoStepRun[];
}

export function DemoScenarioTimeline({ steps }: DemoScenarioTimelineProps): React.ReactElement {
  if (steps.length === 0) {
    return <DemoEmptyState message="This scenario has not been run yet." />;
  }

  return (
    <ol className="aoc-demo-scenario-timeline" aria-label="Scenario step timeline">
      {steps.map((step) => (
        <DemoScenarioStepCard key={step.id} step={step} />
      ))}
    </ol>
  );
}
