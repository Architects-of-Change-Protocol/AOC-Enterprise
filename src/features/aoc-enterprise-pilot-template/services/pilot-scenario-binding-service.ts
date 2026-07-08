import type { DemoScenarioRegistry, DemoScenarioRunner } from '../../aoc-enterprise-demo/services/index.js';
import type { DemoScenarioRun } from '../../aoc-enterprise-demo/domain/demo-step.js';
import type { PilotScenario } from '../domain/pilot-scenario.js';
import { lookupDemoScenario, pilotOutcomeMatchesDemoStatus } from '../integrations/enterprise-demo-pilot-adapter.js';

export type PilotScenarioBindingStatus = 'bound' | 'missing_binding' | 'outcome_mismatch';

export interface PilotScenarioBindingResult {
  readonly pilotScenarioId: string;
  readonly demoScenarioId?: string;
  readonly status: PilotScenarioBindingStatus;
  readonly bound: boolean;
  readonly reason: string;
  readonly demoRun?: DemoScenarioRun;
}

export interface PilotScenarioBindingDeps {
  readonly registry?: DemoScenarioRegistry;
  readonly runner?: DemoScenarioRunner;
}

/**
 * Binds `PilotScenario`s to real Enterprise Demo scenarios. Never runs a
 * fake scenario or invents an outcome -- when `runner` is supplied, it
 * actually executes the real scenario end to end via `DemoScenarioRunner`;
 * otherwise it falls back to the demo scenario's own declared
 * `expectedOutcome` for a lighter-weight, still-real check.
 */
export class PilotScenarioBindingService {
  constructor(private readonly deps: PilotScenarioBindingDeps = {}) {}

  async bindOne(scenario: PilotScenario): Promise<PilotScenarioBindingResult> {
    if (scenario.demoScenarioId === undefined) {
      return {
        pilotScenarioId: scenario.id,
        status: 'missing_binding',
        bound: false,
        reason: `Pilot scenario "${scenario.id}" declares no demoScenarioId to bind against.`,
      };
    }
    if (this.deps.registry === undefined) {
      return {
        pilotScenarioId: scenario.id,
        demoScenarioId: scenario.demoScenarioId,
        status: 'missing_binding',
        bound: false,
        reason: 'No Enterprise Demo scenario registry was supplied to bind against.',
      };
    }

    const demoScenario = lookupDemoScenario(this.deps.registry, scenario.demoScenarioId);
    if (demoScenario === undefined) {
      return {
        pilotScenarioId: scenario.id,
        demoScenarioId: scenario.demoScenarioId,
        status: 'missing_binding',
        bound: false,
        reason: `Enterprise Demo scenario "${scenario.demoScenarioId}" was not found in the registry.`,
      };
    }

    let demoRun: DemoScenarioRun | undefined;
    let actualStatus: string = demoScenario.expectedOutcome;
    if (this.deps.runner !== undefined) {
      demoRun = await this.deps.runner.runScenario(demoScenario.id);
      actualStatus = demoRun.outcome?.status ?? actualStatus;
    }

    const matches = pilotOutcomeMatchesDemoStatus(scenario.expectedOutcome, actualStatus);
    return {
      pilotScenarioId: scenario.id,
      demoScenarioId: scenario.demoScenarioId,
      status: matches ? 'bound' : 'outcome_mismatch',
      bound: matches,
      reason: matches
        ? `Enterprise Demo scenario "${demoScenario.id}" outcome "${actualStatus}" satisfies expected pilot outcome "${scenario.expectedOutcome}".`
        : `Enterprise Demo scenario "${demoScenario.id}" outcome "${actualStatus}" does not satisfy expected pilot outcome "${scenario.expectedOutcome}".`,
      ...(demoRun !== undefined ? { demoRun } : {}),
    };
  }

  async bindAll(scenarios: readonly PilotScenario[]): Promise<readonly PilotScenarioBindingResult[]> {
    const results: PilotScenarioBindingResult[] = [];
    for (const scenario of scenarios) {
      // eslint-disable-next-line no-await-in-loop -- deterministic sequential binding order is required.
      results.push(await this.bindOne(scenario));
    }
    return results;
  }
}

export function createPilotScenarioBindingService(deps: PilotScenarioBindingDeps = {}): PilotScenarioBindingService {
  return new PilotScenarioBindingService(deps);
}
