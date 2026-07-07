import { ALL_DEMO_SCENARIOS } from '../scenarios/index.js';
import { createDemoAssertionService } from './demo-assertion-service.js';
import { createDemoControlPlaneSnapshotService } from './demo-control-plane-snapshot-service.js';
import { createDemoExportService } from './demo-export-service.js';
import { createDemoFixtureOrchestrator } from './demo-fixture-orchestrator.js';
import { createDemoProofChainService } from './demo-proof-chain-service.js';
import { createDemoReportService } from './demo-report-service.js';
import { createDemoScenarioRegistry } from './demo-scenario-registry.js';
import { DemoScenarioRunner } from './demo-scenario-runner.js';
import { createDemoStepRunner } from './demo-step-runner.js';

export { DemoScenarioRegistry, DemoScenarioValidationError, createDemoScenarioRegistry } from './demo-scenario-registry.js';
export { DemoFixtureOrchestrator, createDemoFixtureOrchestrator } from './demo-fixture-orchestrator.js';
export { DemoStepRunner, DemoStepReconciliationError, createDemoStepRunner } from './demo-step-runner.js';
export { DemoAssertionService, DemoUnknownScenarioAssertionError, createDemoAssertionService } from './demo-assertion-service.js';
export {
  DemoScenarioRunner,
  DemoScenarioNotFoundError,
  createDemoScenarioRunner,
  type DemoScenarioRunnerDeps,
} from './demo-scenario-runner.js';
export { DemoScriptService, createDemoScriptService } from './demo-script-service.js';
export { DemoNarrativeService, createDemoNarrativeService } from './demo-narrative-service.js';
export { DemoControlPlaneSnapshotService, createDemoControlPlaneSnapshotService } from './demo-control-plane-snapshot-service.js';
export { DemoProofChainService, createDemoProofChainService } from './demo-proof-chain-service.js';
export { DemoExportService, createDemoExportService } from './demo-export-service.js';
export { DemoResetService, createDemoResetService } from './demo-reset-service.js';
export {
  DemoReportService,
  createDemoReportService,
  type DemoReport,
  type DemoScenarioReportEntry,
} from './demo-report-service.js';

export interface EnterpriseDemoSuite {
  readonly registry: ReturnType<typeof createDemoScenarioRegistry>;
  readonly orchestrator: ReturnType<typeof createDemoFixtureOrchestrator>;
  readonly runner: DemoScenarioRunner;
  readonly assertionService: ReturnType<typeof createDemoAssertionService>;
  readonly proofChainService: ReturnType<typeof createDemoProofChainService>;
  readonly controlPlaneSnapshotService: ReturnType<typeof createDemoControlPlaneSnapshotService>;
  readonly exportService: ReturnType<typeof createDemoExportService>;
  readonly reportService: ReturnType<typeof createDemoReportService>;
}

/** Wires every demo pack service together with the real, registered scenario set. The single composition root for the rest of the module. */
export function createEnterpriseDemoSuite(): EnterpriseDemoSuite {
  const registry = createDemoScenarioRegistry(ALL_DEMO_SCENARIOS);
  const orchestrator = createDemoFixtureOrchestrator();
  const stepRunner = createDemoStepRunner();
  const assertionService = createDemoAssertionService();
  const proofChainService = createDemoProofChainService();
  const controlPlaneSnapshotService = createDemoControlPlaneSnapshotService();
  const exportService = createDemoExportService();
  const reportService = createDemoReportService();

  const runner = new DemoScenarioRunner({
    registry,
    orchestrator,
    stepRunner,
    assertionService,
    proofChainService,
    controlPlaneSnapshotService,
    exportService,
  });

  return { registry, orchestrator, runner, assertionService, proofChainService, controlPlaneSnapshotService, exportService, reportService };
}
