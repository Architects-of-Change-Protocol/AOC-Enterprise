import * as React from 'react';
import type { DemoScenarioId } from '../domain/demo-scenario.js';
import type { DemoScenarioRun } from '../domain/demo-step.js';
import type { DemoScenarioRunner } from '../services/demo-scenario-runner.js';

export type DemoScenarioRunnerStatus = 'idle' | 'running' | 'passed' | 'failed' | 'error';

export interface UseDemoScenarioRunnerResult {
  readonly status: DemoScenarioRunnerStatus;
  readonly run?: DemoScenarioRun;
  readonly errorMessage?: string;
  readonly runScenario: (scenarioId: DemoScenarioId) => void;
}

/**
 * Drives DemoScenarioRunner.runScenario from an interactive UI. Every run it
 * produces is a real, awaited DemoScenarioRun built from actual runtime
 * calls -- there is no synthetic "pretend it succeeded" state. Server-side
 * renders should instead pass a pre-computed `initialRun` (built the same
 * way the Control Plane's demo fixture pre-builds its read model).
 */
function toRunnerStatus(status: DemoScenarioRun['status']): DemoScenarioRunnerStatus {
  return status === 'not_started' ? 'idle' : status;
}

export function useDemoScenarioRunner(runner: DemoScenarioRunner, initialRun?: DemoScenarioRun): UseDemoScenarioRunnerResult {
  const [status, setStatus] = React.useState<DemoScenarioRunnerStatus>(initialRun !== undefined ? toRunnerStatus(initialRun.status) : 'idle');
  const [run, setRun] = React.useState<DemoScenarioRun | undefined>(initialRun);
  const [errorMessage, setErrorMessage] = React.useState<string | undefined>(undefined);

  const runScenario = React.useCallback(
    (scenarioId: DemoScenarioId) => {
      setStatus('running');
      setErrorMessage(undefined);
      runner
        .runScenario(scenarioId)
        .then((result) => {
          setRun(result);
          setStatus(toRunnerStatus(result.status));
        })
        .catch((error: unknown) => {
          setStatus('error');
          setErrorMessage(error instanceof Error ? error.message : 'Unknown error running scenario.');
        });
    },
    [runner],
  );

  return {
    status,
    ...(run !== undefined ? { run } : {}),
    ...(errorMessage !== undefined ? { errorMessage } : {}),
    runScenario,
  };
}
