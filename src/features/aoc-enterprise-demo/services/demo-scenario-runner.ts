import type { DemoScenarioId } from '../domain/demo-scenario.js';
import type { DemoScenarioRun, DemoScenarioRunStatus } from '../domain/demo-step.js';
import { SCENARIO_EXECUTORS } from '../scenarios/index.js';
import { createTickingClock } from '../scenarios/scenario-runtime-types.js';
import { DemoAssertionService } from './demo-assertion-service.js';
import { DemoControlPlaneSnapshotService } from './demo-control-plane-snapshot-service.js';
import { DemoExportService } from './demo-export-service.js';
import { DemoFixtureOrchestrator } from './demo-fixture-orchestrator.js';
import { DemoProofChainService } from './demo-proof-chain-service.js';
import { DemoScenarioRegistry } from './demo-scenario-registry.js';
import { DemoStepRunner } from './demo-step-runner.js';

export class DemoScenarioNotFoundError extends Error {}

const RUN_CLOCK_START = '2026-01-01T00:00:00.000Z';

export interface DemoScenarioRunnerDeps {
  readonly registry: DemoScenarioRegistry;
  readonly orchestrator: DemoFixtureOrchestrator;
  readonly stepRunner: DemoStepRunner;
  readonly assertionService: DemoAssertionService;
  readonly proofChainService: DemoProofChainService;
  readonly controlPlaneSnapshotService: DemoControlPlaneSnapshotService;
  readonly exportService: DemoExportService;
}

/**
 * Runs one demo scenario end to end against a fresh EnterpriseDemoWorld: the
 * scenario's own executor drives the real Recognition/Authority/Approval/
 * Handshake/Enforcement calls, then this runner reconciles the step
 * timeline, evaluates assertions, extracts the proof chain, builds the
 * Control Plane snapshot and renders export artifacts -- all from what the
 * executor actually returned.
 */
export class DemoScenarioRunner {
  private runCounter = 0;

  constructor(private readonly deps: DemoScenarioRunnerDeps) {}

  async runScenario(scenarioId: DemoScenarioId): Promise<DemoScenarioRun> {
    const scenario = this.deps.registry.getScenario(scenarioId);
    if (scenario === undefined) {
      throw new DemoScenarioNotFoundError(`Unknown demo scenario: "${scenarioId}".`);
    }
    const executor = SCENARIO_EXECUTORS[scenarioId];

    this.runCounter += 1;
    const runId = `scenario-run-${scenarioId}-${String(this.runCounter).padStart(4, '0')}`;
    const clock = createTickingClock(RUN_CLOCK_START);
    const startedAt = clock();

    const world = this.deps.orchestrator.createWorld();
    const execution = await executor(world, { now: clock });
    const steps = this.deps.stepRunner.reconcile(scenario, execution.steps);
    const assertions = this.deps.assertionService.evaluate(scenario, execution);
    const proofChain = this.deps.proofChainService.buildProofChain(scenario, world, execution);
    const controlPlaneSnapshot = this.deps.controlPlaneSnapshotService.buildSnapshot(scenario, world, execution, proofChain, clock);
    const exportArtifacts = this.deps.exportService.buildArtifacts(scenario, execution.outcome, assertions, proofChain, clock);
    const completedAt = clock();

    const status: DemoScenarioRunStatus = this.deps.assertionService.allPassed(assertions) ? 'passed' : 'failed';

    return {
      id: runId,
      scenarioId,
      status,
      startedAt,
      completedAt,
      steps,
      outcome: execution.outcome,
      assertions,
      controlPlaneSnapshot,
      proofChain,
      exportArtifacts,
    };
  }
}

export function createDemoScenarioRunner(deps: DemoScenarioRunnerDeps): DemoScenarioRunner {
  return new DemoScenarioRunner(deps);
}
