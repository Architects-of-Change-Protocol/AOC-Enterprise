import * as React from 'react';
import type { DemoScenarioId } from '../domain/demo-scenario.js';

export interface UseDemoScenarioSelectionResult {
  readonly scenarioId: DemoScenarioId;
  readonly selectScenario: (scenarioId: DemoScenarioId) => void;
}

/** Tracks which demo scenario is selected. Pure UI navigation state -- it decides nothing about scenario outcomes. */
export function useDemoScenarioSelection(initialScenarioId: DemoScenarioId): UseDemoScenarioSelectionResult {
  const [scenarioId, setScenarioId] = React.useState<DemoScenarioId>(initialScenarioId);
  return { scenarioId, selectScenario: setScenarioId };
}
