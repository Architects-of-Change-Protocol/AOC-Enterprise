import type { DemoScenario, DemoScenarioCategory, DemoScenarioId } from '../domain/demo-scenario.js';

export class DemoScenarioValidationError extends Error {}

function validateScenario(scenario: DemoScenario): void {
  if (scenario.title.trim().length === 0) {
    throw new DemoScenarioValidationError(`Scenario "${scenario.id}" is missing a title.`);
  }
  if (scenario.summary.trim().length === 0) {
    throw new DemoScenarioValidationError(`Scenario "${scenario.id}" is missing a summary.`);
  }
  if (scenario.enterpriseMessage.trim().length === 0) {
    throw new DemoScenarioValidationError(`Scenario "${scenario.id}" is missing an enterprise message.`);
  }
  if (scenario.buyerPain.trim().length === 0) {
    throw new DemoScenarioValidationError(`Scenario "${scenario.id}" is missing a buyer pain statement.`);
  }
  if (scenario.aocValue.trim().length === 0) {
    throw new DemoScenarioValidationError(`Scenario "${scenario.id}" is missing a Soberanía value statement.`);
  }
  if (scenario.steps.length === 0) {
    throw new DemoScenarioValidationError(`Scenario "${scenario.id}" has no steps.`);
  }
  if (scenario.expectedAssertions.length === 0) {
    throw new DemoScenarioValidationError(`Scenario "${scenario.id}" has no expected assertions.`);
  }
}

/**
 * A deterministic, in-memory registry of demo scenario definitions. It holds
 * only the declarative DemoScenario data -- title, narrative, steps and
 * expected assertions -- never the real runtime calls that back them (those
 * live in each scenario's own executor, wired up by the runner).
 */
export class DemoScenarioRegistry {
  private readonly scenariosById = new Map<DemoScenarioId, DemoScenario>();

  constructor(scenarios: readonly DemoScenario[]) {
    const seenIds = new Set<DemoScenarioId>();
    for (const scenario of scenarios) {
      if (seenIds.has(scenario.id)) {
        throw new DemoScenarioValidationError(`Duplicate scenario id "${scenario.id}".`);
      }
      seenIds.add(scenario.id);
      validateScenario(scenario);
      this.scenariosById.set(scenario.id, scenario);
    }
  }

  getScenario(id: DemoScenarioId): DemoScenario | undefined {
    return this.scenariosById.get(id);
  }

  listScenarios(): readonly DemoScenario[] {
    return [...this.scenariosById.values()];
  }

  listByCategory(category: DemoScenarioCategory): readonly DemoScenario[] {
    return this.listScenarios().filter((scenario) => scenario.category === category);
  }

  listByTag(tag: string): readonly DemoScenario[] {
    return this.listScenarios().filter((scenario) => scenario.tags.includes(tag));
  }
}

export function createDemoScenarioRegistry(scenarios: readonly DemoScenario[]): DemoScenarioRegistry {
  return new DemoScenarioRegistry(scenarios);
}
