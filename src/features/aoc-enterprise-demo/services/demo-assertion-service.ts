import type { DemoAssertionResult } from '../domain/demo-assertion.js';
import type { DemoScenario, DemoScenarioId } from '../domain/demo-scenario.js';
import { SCENARIO_ASSERTION_EVALUATORS } from '../scenarios/index.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutionResult } from '../scenarios/scenario-runtime-types.js';

export class DemoUnknownScenarioAssertionError extends Error {}

/**
 * Evaluates a scenario's DemoAssertionDefinitions against the real runtime
 * outputs its executor produced. The actual pass/fail logic for each
 * scenario lives with that scenario (it alone knows what "correct" looks
 * like for its own governance path); this service is the single place every
 * caller goes through to run it. The evaluator map defaults to the real,
 * registered scenario evaluators but can be overridden for testing.
 */
export class DemoAssertionService {
  constructor(private readonly evaluators: Readonly<Record<DemoScenarioId, ScenarioAssertionEvaluator>> = SCENARIO_ASSERTION_EVALUATORS) {}

  evaluate(scenario: DemoScenario, result: ScenarioExecutionResult): readonly DemoAssertionResult[] {
    const evaluator = this.evaluators[scenario.id as DemoScenarioId];
    if (evaluator === undefined) {
      throw new DemoUnknownScenarioAssertionError(`No assertion evaluator registered for scenario "${scenario.id}".`);
    }
    return evaluator(scenario, result);
  }

  allPassed(assertions: readonly DemoAssertionResult[]): boolean {
    return assertions.length > 0 && assertions.every((assertion) => assertion.passed);
  }
}

export function createDemoAssertionService(evaluators?: Readonly<Record<DemoScenarioId, ScenarioAssertionEvaluator>>): DemoAssertionService {
  return new DemoAssertionService(evaluators);
}
