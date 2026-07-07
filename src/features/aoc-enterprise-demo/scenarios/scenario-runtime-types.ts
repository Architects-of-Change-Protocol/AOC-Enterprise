import type { EnforcementOutcome } from '../../action-enforcement/domain/enforcement-outcome.js';
import type { DemoAssertionResult } from '../domain/demo-assertion.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoScenarioOutcome } from '../domain/demo-outcome.js';
import type { DemoStepRun } from '../domain/demo-step.js';
import type { EnterpriseDemoWorld } from '../fixtures/enterprise-demo-world.fixture.js';

export interface ScenarioExecutionContext {
  readonly now: () => string;
}

/**
 * The real, runtime-backed result of running one demo scenario: the final
 * DemoScenarioOutcome, the DemoStepRun timeline the scenario script itself
 * produced (it is the only code that knows which runtime call corresponds to
 * which declared step), and every EnforcementOutcome the scenario drove
 * through AocGuard, in call order, for assertion/proof-chain extraction.
 */
export interface ScenarioExecutionResult {
  readonly outcome: DemoScenarioOutcome;
  readonly steps: readonly DemoStepRun[];
  readonly enforcementOutcomes: readonly EnforcementOutcome<unknown>[];
}

export type ScenarioExecutor = (world: EnterpriseDemoWorld, ctx: ScenarioExecutionContext) => Promise<ScenarioExecutionResult>;

export type ScenarioAssertionEvaluator = (scenario: DemoScenario, result: ScenarioExecutionResult) => readonly DemoAssertionResult[];

/**
 * A small, deterministic, monotonically increasing clock for scenario/step
 * timestamps. Never reads the wall clock or generates randomness: it derives
 * every timestamp from a fixed start instant plus a call counter.
 */
export function createTickingClock(startIso: string): () => string {
  const startMs = Date.parse(startIso);
  let tick = 0;
  return () => {
    const next = new Date(startMs + tick * 1000).toISOString();
    tick += 1;
    return next;
  };
}
