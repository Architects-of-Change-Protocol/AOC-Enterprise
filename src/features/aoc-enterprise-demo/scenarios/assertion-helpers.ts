import type { DemoAssertionResult, DemoAssertionType } from '../domain/demo-assertion.js';
import type { DemoScenarioOutcome } from '../domain/demo-outcome.js';
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

/**
 * Checks that a policy-pack-driven outcome carries a real policy decision
 * id, a real policy proof id, and matched the specific rule the scenario's
 * story depends on. Reads exclusively from `DemoScenarioOutcome`'s policy
 * fields -- fields Action Enforcement's own decision only ever carries when
 * a Domain Policy Pack Runtime integration actually evaluated the request.
 */
export function policyDecisionAssertion(
  scenarioId: DemoScenarioId,
  assertionId: string,
  expected: string,
  outcome: DemoScenarioOutcome,
  expectedRuleId: string,
): DemoAssertionResult {
  const hasDecision = outcome.policyDecisionId !== undefined;
  const hasProof = outcome.policyProofId !== undefined;
  const matchedRule = outcome.policyMatchedRuleIds?.includes(expectedRuleId) ?? false;
  const passed = hasDecision && hasProof && matchedRule;

  return assertionResult(
    scenarioId,
    assertionId,
    'policy_decision',
    expected,
    passed,
    `policyDecisionId=${outcome.policyDecisionId ?? 'none'}, policyProofId=${outcome.policyProofId ?? 'none'}, matchedRuleIds=${(outcome.policyMatchedRuleIds ?? []).join(',') || 'none'}`,
    passed ? 'POLICY_DECISION_REFERENCED' : 'POLICY_DECISION_MISSING',
    passed
      ? `Domain Policy Pack Runtime decision ${outcome.policyDecisionId} (rule ${expectedRuleId}) is referenced by this outcome, with a real policy proof.`
      : `Expected a policy decision matching rule "${expectedRuleId}" with both a policyDecisionId and a policyProofId.`,
  );
}
