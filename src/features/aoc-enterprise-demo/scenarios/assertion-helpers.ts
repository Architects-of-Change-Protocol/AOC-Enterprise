import type { DemoAssertionResult, DemoAssertionType } from '../domain/demo-assertion.js';
import type { DemoScenarioId } from '../domain/demo-scenario.js';

export function assertionResult(
  scenarioId: DemoScenarioId,
  assertionId: string,
  type: DemoAssertionType,
  expected: string,
  passed: boolean,
  actual: string,
  reasonCode: string,
  reason: string,
): DemoAssertionResult {
  return {
    id: `assertion-result-${scenarioId}-${assertionId}`,
    scenarioId,
    assertionId,
    type,
    passed,
    expected,
    actual,
    reasonCode,
    reason,
  };
}

/** The single most safety-critical check across every scenario: did the real executor callback run, and how many times. */
export function executorSafetyAssertion(
  scenarioId: DemoScenarioId,
  assertionId: string,
  expected: string,
  expectedRuns: number,
  actualRuns: number,
): DemoAssertionResult {
  const passed = actualRuns === expectedRuns;
  return assertionResult(
    scenarioId,
    assertionId,
    'executor_safety',
    expected,
    passed,
    `executor ran ${actualRuns} time(s)`,
    passed ? 'EXECUTOR_SAFETY_CONFIRMED' : 'EXECUTOR_SAFETY_VIOLATION',
    passed
      ? `The real executor ran exactly ${expectedRuns} time(s) as expected.`
      : `Expected the executor to run ${expectedRuns} time(s), but it ran ${actualRuns} time(s).`,
  );
}
