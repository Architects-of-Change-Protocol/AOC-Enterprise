import * as React from 'react';
import type { DemoScenario, DemoScenarioId } from '../domain/demo-scenario.js';
import { DemoEmptyState } from './DemoEmptyState.js';

export interface DemoScenarioSelectorProps {
  readonly scenarios: readonly DemoScenario[];
  readonly selectedScenarioId?: DemoScenarioId;
  readonly onSelect?: (scenarioId: DemoScenarioId) => void;
}

export function DemoScenarioSelector({ scenarios, selectedScenarioId, onSelect }: DemoScenarioSelectorProps): React.ReactElement {
  if (scenarios.length === 0) {
    return <DemoEmptyState message="No demo scenarios are registered." />;
  }

  return (
    <ul className="aoc-demo-scenario-selector" aria-label="Demo scenarios">
      {scenarios.map((scenario) => {
        const selected = scenario.id === selectedScenarioId;
        return (
          <li key={scenario.id} className={selected ? 'aoc-demo-scenario-selector__item aoc-demo-scenario-selector__item--selected' : 'aoc-demo-scenario-selector__item'}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={onSelect ? () => onSelect(scenario.id) : undefined}
            >
              <span className="aoc-demo-scenario-selector__title">{scenario.shortTitle}</span>
              <span className="aoc-demo-scenario-selector__category">{scenario.category}</span>
              <span className="aoc-demo-scenario-selector__outcome">{scenario.expectedOutcome}</span>
              <span className="aoc-demo-scenario-selector__tags">{scenario.tags.join(', ')}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
