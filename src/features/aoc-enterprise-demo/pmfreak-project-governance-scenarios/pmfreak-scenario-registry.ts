import type { PMFreakProjectGovernanceScenario, PMFreakProjectGovernanceScenarioCategory, PMFreakProjectGovernanceScenarioRegistry } from './pmfreak-project-governance-scenario-types.js';

/**
 * Builds an in-memory Project Governance Scenario registry. Deterministic,
 * no mutation, no network calls -- the registry never derives a scenario it
 * was not given, never mutates the scenarios passed to it, and preserves
 * insertion order for `listScenarioIds()`.
 */
export function createPMFreakProjectGovernanceScenarioRegistry(scenarios: readonly PMFreakProjectGovernanceScenario[]): PMFreakProjectGovernanceScenarioRegistry {
  const list: readonly PMFreakProjectGovernanceScenario[] = [...scenarios];
  const byScenarioId = new Map<string, PMFreakProjectGovernanceScenario>(list.map((scenario) => [scenario.scenarioId, scenario]));

  return {
    scenarios: list,
    findByScenarioId(scenarioId: string): PMFreakProjectGovernanceScenario | undefined {
      return byScenarioId.get(scenarioId);
    },
    findByCategory(category: PMFreakProjectGovernanceScenarioCategory): readonly PMFreakProjectGovernanceScenario[] {
      return list.filter((scenario) => scenario.category === category);
    },
    listScenarioIds(): readonly string[] {
      return list.map((scenario) => scenario.scenarioId);
    },
  };
}
