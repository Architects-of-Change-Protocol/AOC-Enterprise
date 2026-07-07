import type { DemoPolicyPackScenarioMetadata, DemoPolicyPackScenarioRun } from '../domain/demo-policy-pack.js';
import type { DemoScenario, DemoScenarioId } from '../domain/demo-scenario.js';
import { SCENARIO_EXECUTORS, createTickingClock } from '../scenarios/index.js';
import { DemoPolicyPackControlPlaneService } from './demo-policy-pack-control-plane-service.js';
import { DemoFixtureOrchestrator } from './demo-fixture-orchestrator.js';
import { DemoScenarioRegistry } from './demo-scenario-registry.js';
import { DemoScenarioRunner } from './demo-scenario-runner.js';

export class DemoPolicyPackScenarioNotFoundError extends Error {}

const POLICY_SNAPSHOT_CLOCK_START = '2026-01-01T00:00:00.000Z';

export interface DemoPolicyPackScenarioServiceDeps {
  readonly registry: DemoScenarioRegistry;
  readonly orchestrator: DemoFixtureOrchestrator;
  readonly runner: DemoScenarioRunner;
  readonly policyPackControlPlaneService: DemoPolicyPackControlPlaneService;
}

/**
 * The composition point for the Policy Pack Enterprise Demo Extension.
 * Lists and runs only the eight `policy_packs`-category scenarios, running
 * each one through the existing, shared `DemoScenarioRunner` (so step
 * reconciliation, assertions, proof chain, the standard Control Plane
 * snapshot and export artifacts are all produced exactly the way every
 * other scenario produces them), then separately builds the richer
 * policy-pack-focused Control Plane snapshot from a second real run of the
 * same scenario's executor -- both runs are deterministic (fresh world,
 * fixed clock, sequential ids), so they produce byte-identical decision and
 * proof ids; nothing here re-derives or fabricates a governance outcome.
 */
export class DemoPolicyPackScenarioService {
  constructor(private readonly deps: DemoPolicyPackScenarioServiceDeps) {}

  listPolicyPackScenarios(): readonly DemoScenario[] {
    return this.deps.registry.listByCategory('policy_packs');
  }

  async runScenario(scenarioId: DemoScenarioId): Promise<DemoPolicyPackScenarioRun> {
    const scenario = this.deps.registry.getScenario(scenarioId);
    if (scenario === undefined || scenario.category !== 'policy_packs') {
      throw new DemoPolicyPackScenarioNotFoundError(`Unknown policy-pack demo scenario: "${scenarioId}".`);
    }

    const run = await this.deps.runner.runScenario(scenarioId);

    const executor = SCENARIO_EXECUTORS[scenarioId];
    const world = this.deps.orchestrator.createWorld();
    const clock = createTickingClock(POLICY_SNAPSHOT_CLOCK_START);
    const execution = await executor(world, { now: clock });
    const policyControlPlaneSnapshot = this.deps.policyPackControlPlaneService.buildSnapshot(scenario, world, execution, clock);

    const policyMetadata = this.extractPolicyMetadata(run);
    const executorSafetyVerified = this.verifyExecutorSafety(scenario, run);
    const policyReferencesVerified = this.verifyPolicyReferences(run);
    const controlPlaneSnapshotVerified = this.verifyControlPlaneSnapshot(run);

    return {
      ...run,
      scenario,
      policyMetadata,
      policyControlPlaneSnapshot,
      executorSafetyVerified,
      policyReferencesVerified,
      controlPlaneSnapshotVerified,
    };
  }

  private extractPolicyMetadata(run: Awaited<ReturnType<DemoScenarioRunner['runScenario']>>): DemoPolicyPackScenarioMetadata {
    const outcome = run.outcome;
    if (outcome === undefined) return {};
    return {
      ...(outcome.policyDecisionId !== undefined ? { policyDecisionId: outcome.policyDecisionId } : {}),
      ...(outcome.policyProofId !== undefined ? { policyProofId: outcome.policyProofId } : {}),
      ...(outcome.policyPackVersionIds !== undefined ? { policyPackVersionIds: outcome.policyPackVersionIds } : {}),
      ...(outcome.policyMatchedRuleIds !== undefined ? { policyMatchedRuleIds: outcome.policyMatchedRuleIds } : {}),
      ...(outcome.policyReasonCode !== undefined ? { policyReasonCode: outcome.policyReasonCode } : {}),
      ...(outcome.policyReason !== undefined ? { policyReason: outcome.policyReason } : {}),
    };
  }

  /** The real executor must have run if and only if the scenario's declared expected outcome is "executed". */
  private verifyExecutorSafety(scenario: DemoScenario, run: Awaited<ReturnType<DemoScenarioRunner['runScenario']>>): boolean {
    if (run.outcome === undefined) return false;
    const shouldHaveRun = scenario.expectedOutcome === 'executed';
    return run.outcome.executorRan === shouldHaveRun;
  }

  /** Every policy-pack scenario's action is evaluated by a policy pack, so a real policyDecisionId and policyProofId must both be present. */
  private verifyPolicyReferences(run: Awaited<ReturnType<DemoScenarioRunner['runScenario']>>): boolean {
    return run.outcome?.policyDecisionId !== undefined && run.outcome?.policyProofId !== undefined;
  }

  private verifyControlPlaneSnapshot(run: Awaited<ReturnType<DemoScenarioRunner['runScenario']>>): boolean {
    return run.controlPlaneSnapshot?.visiblePanelIds.includes('policy_packs') ?? false;
  }
}

export function createDemoPolicyPackScenarioService(deps: DemoPolicyPackScenarioServiceDeps): DemoPolicyPackScenarioService {
  return new DemoPolicyPackScenarioService(deps);
}
