import type { DemoScenario, DemoScenarioId } from '../domain/demo-scenario.js';
import type { DemoScenarioRun } from '../domain/demo-step.js';
import type { DemoScenarioRunner } from '../services/demo-scenario-runner.js';
import { useDemoScenarioRunner, type DemoScenarioRunnerStatus } from './useDemoScenarioRunner.js';
import { useDemoScenarioSelection } from './useDemoScenarioSelection.js';

export interface UseAocEnterpriseDemoResult {
  readonly scenarios: readonly DemoScenario[];
  readonly selectedScenario?: DemoScenario;
  readonly scenarioId: DemoScenarioId;
  readonly selectScenario: (scenarioId: DemoScenarioId) => void;
  readonly status: DemoScenarioRunnerStatus;
  readonly run?: DemoScenarioRun;
  readonly errorMessage?: string;
  readonly runScenario: (scenarioId: DemoScenarioId) => void;
}

/**
 * The top-level composite hook behind AocEnterpriseDemoPage: which scenario
 * is selected, and the real DemoScenarioRun, if present, produced by running it.
 */
export function useAocEnterpriseDemo(
  scenarios: readonly DemoScenario[],
  runner: DemoScenarioRunner,
  initialScenarioId: DemoScenarioId,
  initialRun?: DemoScenarioRun,
): UseAocEnterpriseDemoResult {
  const { scenarioId, selectScenario } = useDemoScenarioSelection(initialScenarioId);
  const { status, run, errorMessage, runScenario } = useDemoScenarioRunner(runner, initialRun);
  const selectedScenario = scenarios.find((scenario) => scenario.id === scenarioId);

  return {
    scenarios,
    ...(selectedScenario !== undefined ? { selectedScenario } : {}),
    scenarioId,
    selectScenario,
    status,
    ...(run !== undefined ? { run } : {}),
    ...(errorMessage !== undefined ? { errorMessage } : {}),
    runScenario,
  };
}
