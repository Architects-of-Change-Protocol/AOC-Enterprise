import type { DemoScenarioRegistry, DemoScenarioRunner } from '../../aoc-enterprise-demo/services/index.js';
import type { ExportPackageRuntime } from '../../verifiable-export-package/services/export-package-runtime.js';
import type { PilotTemplate, PilotTemplateId } from '../domain/pilot-template.js';
import type { PilotKit, PilotGeneratedArtifact, PilotReadinessReport } from '../domain/pilot-kit.js';
import type { PilotScenario } from '../domain/pilot-scenario.js';
import type { PilotExportPackageDefinition } from '../domain/pilot-export-package.js';
import type { PilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { PilotTemplateStore, createPilotTemplateStore } from './pilot-template-store.js';
import { PilotTemplateRegistry, createPilotTemplateRegistry, type PilotTemplateValidationResult } from './pilot-template-registry.js';
import { PilotScenarioBindingService, createPilotScenarioBindingService, type PilotScenarioBindingResult } from './pilot-scenario-binding-service.js';
import { PilotExportPackageBindingService, createPilotExportPackageBindingService, type PilotExportPackageBindingResult } from './pilot-export-package-binding-service.js';
import { PilotControlPlaneWalkthroughService, createPilotControlPlaneWalkthroughService } from './pilot-control-plane-walkthrough-service.js';
import { PilotAcceptanceService, createPilotAcceptanceService } from './pilot-acceptance-service.js';
import { PilotSuccessMetricsService, createPilotSuccessMetricsService } from './pilot-success-metrics-service.js';
import { PilotRiskService, createPilotRiskService } from './pilot-risk-service.js';
import { PilotReadinessService, createPilotReadinessService } from './pilot-readiness-service.js';
import { PilotScriptService, createPilotScriptService } from './pilot-script-service.js';
import { PilotQueryService, createPilotQueryService, type PilotQueryFilter } from './pilot-query-service.js';
import { PilotKitBuilder, createPilotKitBuilder, type PilotKitBuildInput } from './pilot-kit-builder.js';

export class PilotTemplateNotFoundError extends Error {}

export interface PilotRuntimeDeps {
  readonly demoScenarioRegistry?: DemoScenarioRegistry;
  readonly demoScenarioRunner?: DemoScenarioRunner;
  readonly exportPackageRuntime?: ExportPackageRuntime;
}

/**
 * The single composition root for the Soberanía Enterprise Pilot Template
 * feature: wires the store, registry and every service together and
 * exposes the small, stable API other callers (fixtures, tests, a future
 * CLI/UI) are expected to use.
 */
export class PilotRuntime {
  readonly store: PilotTemplateStore;
  readonly registry: PilotTemplateRegistry;
  readonly scenarioBindingService: PilotScenarioBindingService;
  readonly exportPackageBindingService: PilotExportPackageBindingService;
  readonly controlPlaneWalkthroughService: PilotControlPlaneWalkthroughService;
  readonly acceptanceService: PilotAcceptanceService;
  readonly successMetricsService: PilotSuccessMetricsService;
  readonly riskService: PilotRiskService;
  readonly readinessService: PilotReadinessService;
  readonly scriptService: PilotScriptService;
  readonly queryService: PilotQueryService;
  readonly kitBuilder: PilotKitBuilder;

  constructor(private readonly ctx: PilotRuntimeContext, deps: PilotRuntimeDeps = {}) {
    this.store = createPilotTemplateStore();
    this.registry = createPilotTemplateRegistry(this.store);
    this.scenarioBindingService = createPilotScenarioBindingService({
      ...(deps.demoScenarioRegistry !== undefined ? { registry: deps.demoScenarioRegistry } : {}),
      ...(deps.demoScenarioRunner !== undefined ? { runner: deps.demoScenarioRunner } : {}),
    });
    this.exportPackageBindingService = createPilotExportPackageBindingService({
      ...(deps.exportPackageRuntime !== undefined ? { runtime: deps.exportPackageRuntime } : {}),
    });
    this.controlPlaneWalkthroughService = createPilotControlPlaneWalkthroughService();
    this.acceptanceService = createPilotAcceptanceService();
    this.successMetricsService = createPilotSuccessMetricsService();
    this.riskService = createPilotRiskService();
    this.readinessService = createPilotReadinessService(ctx);
    this.scriptService = createPilotScriptService(ctx);
    this.queryService = createPilotQueryService(this.store);
    this.kitBuilder = createPilotKitBuilder(
      ctx,
      this.store,
      this.scenarioBindingService,
      this.exportPackageBindingService,
      this.controlPlaneWalkthroughService,
      this.acceptanceService,
      this.riskService,
      this.readinessService,
      this.scriptService,
    );
  }

  registerTemplate(template: PilotTemplate): PilotTemplateValidationResult {
    return this.registry.registerBuiltIn(template);
  }

  listTemplates(): readonly PilotTemplate[] {
    return this.store.listTemplates();
  }

  getTemplate(id: PilotTemplateId): PilotTemplate | undefined {
    return this.store.getTemplate(id);
  }

  async buildPilotKit(input: PilotKitBuildInput): Promise<PilotKit> {
    return this.kitBuilder.build(input);
  }

  getPilotKit(id: string): PilotKit | undefined {
    return this.store.getKit(id);
  }

  checkReadiness(kitId: string): PilotReadinessReport {
    const kit = this.store.getKit(kitId);
    if (kit === undefined) {
      throw new PilotTemplateNotFoundError(`Unknown pilot kit "${kitId}".`);
    }
    return kit.readiness;
  }

  generateArtifacts(templateId: PilotTemplateId): readonly PilotGeneratedArtifact[] {
    const template = this.store.getTemplate(templateId);
    if (template === undefined) {
      throw new PilotTemplateNotFoundError(`Unknown pilot template "${templateId}".`);
    }
    return this.scriptService.generateAll(template);
  }

  async bindScenario(scenario: PilotScenario): Promise<PilotScenarioBindingResult> {
    return this.scenarioBindingService.bindOne(scenario);
  }

  bindExportPackage(definition: PilotExportPackageDefinition, exportPackageId?: string): PilotExportPackageBindingResult {
    return this.exportPackageBindingService.bindOne(definition, exportPackageId);
  }

  queryTemplates(filter: PilotQueryFilter): readonly PilotTemplate[] {
    return this.queryService.query(filter);
  }
}

export function createPilotRuntime(ctx: PilotRuntimeContext, deps: PilotRuntimeDeps = {}): PilotRuntime {
  return new PilotRuntime(ctx, deps);
}
