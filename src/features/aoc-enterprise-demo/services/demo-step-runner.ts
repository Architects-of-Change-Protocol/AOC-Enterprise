import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoStepRun } from '../domain/demo-step.js';

export class DemoStepReconciliationError extends Error {}

/**
 * Each scenario's own executor is the only code with enough context to know
 * which real runtime call corresponds to which declared step (a single
 * enforcement call can satisfy a recognition step, an authority step and an
 * enforcement step at once, depending on the scenario). DemoStepRunner does
 * not re-run or re-interpret runtime calls itself; it reconciles the
 * DemoStepRun[] a scenario executor produced against that scenario's
 * declared DemoStepDefinition[], so a scenario can never silently drop or
 * reorder a declared step.
 */
export class DemoStepRunner {
  reconcile(scenario: DemoScenario, steps: readonly DemoStepRun[]): readonly DemoStepRun[] {
    if (steps.length !== scenario.steps.length) {
      throw new DemoStepReconciliationError(
        `Scenario "${scenario.id}" declared ${scenario.steps.length} step(s) but its executor produced ${steps.length}.`,
      );
    }
    for (let index = 0; index < scenario.steps.length; index += 1) {
      const declared = scenario.steps[index]!;
      const produced = steps[index]!;
      if (declared.id !== produced.stepId) {
        throw new DemoStepReconciliationError(
          `Scenario "${scenario.id}" step ${index} mismatch: declared "${declared.id}" but executor produced "${produced.stepId}".`,
        );
      }
      if (declared.kind !== produced.kind) {
        throw new DemoStepReconciliationError(
          `Scenario "${scenario.id}" step "${declared.id}" kind mismatch: declared "${declared.kind}" but executor produced "${produced.kind}".`,
        );
      }
    }
    return steps;
  }
}

export function createDemoStepRunner(): DemoStepRunner {
  return new DemoStepRunner();
}
