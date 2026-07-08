import type { AocControlPlaneReadModel } from '../../aoc-control-plane/domain/control-plane-view-model.js';
import type { PilotTemplate } from '../domain/pilot-template.js';
import type { PilotKit, PilotKitStatus } from '../domain/pilot-kit.js';
import type { PilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { PilotTemplateStore } from './pilot-template-store.js';
import { PilotScenarioBindingService } from './pilot-scenario-binding-service.js';
import { PilotExportPackageBindingService } from './pilot-export-package-binding-service.js';
import { PilotControlPlaneWalkthroughService } from './pilot-control-plane-walkthrough-service.js';
import { PilotAcceptanceService } from './pilot-acceptance-service.js';
import { PilotRiskService } from './pilot-risk-service.js';
import { PilotReadinessService } from './pilot-readiness-service.js';
import { PilotScriptService } from './pilot-script-service.js';

export interface PilotKitBuildInput {
  readonly template: PilotTemplate;
  readonly exportPackageIdsByDefinitionId?: Readonly<Record<string, string>>;
  readonly controlPlaneReadModel?: AocControlPlaneReadModel;
  readonly boundPolicyPackIds?: readonly string[];
  readonly boundPolicyPackVersionIds?: readonly string[];
  readonly boundEvidenceProofIds?: readonly string[];
  readonly controlPlaneSnapshotIds?: readonly string[];
}

/**
 * The single composition point that assembles a `PilotKit` from a
 * `PilotTemplate`: binds real Enterprise Demo scenarios and Verifiable
 * Export Packages, validates the Control Plane walkthrough, evaluates
 * acceptance criteria and risks, checks readiness, and generates the
 * template's text artifacts. Never fabricates a binding a dependent
 * service could not confirm, and never marks a kit `validated`/`ready` when
 * `PilotReadinessService` reports `not_ready`.
 */
export class PilotKitBuilder {
  constructor(
    private readonly ctx: PilotRuntimeContext,
    private readonly store: PilotTemplateStore,
    private readonly scenarioBindingService: PilotScenarioBindingService,
    private readonly exportPackageBindingService: PilotExportPackageBindingService,
    private readonly controlPlaneWalkthroughService: PilotControlPlaneWalkthroughService,
    private readonly acceptanceService: PilotAcceptanceService,
    private readonly riskService: PilotRiskService,
    private readonly readinessService: PilotReadinessService,
    private readonly scriptService: PilotScriptService,
  ) {}

  async build(input: PilotKitBuildInput): Promise<PilotKit> {
    const { template } = input;

    const scenarioBindings = await this.scenarioBindingService.bindAll(template.scenarios);
    const exportPackageBindings = this.exportPackageBindingService.bindAll(template.exportPackages, input.exportPackageIdsByDefinitionId ?? {});
    const controlPlaneWalkthroughResult = this.controlPlaneWalkthroughService.validate(template.controlPlaneWalkthrough, input.controlPlaneReadModel);
    const acceptanceEvaluation = this.acceptanceService.evaluate({ criteria: template.acceptanceCriteria, scenarioBindings, exportPackageBindings });
    const riskEvaluation = this.riskService.evaluate(template, { exportPackageBindings });

    const readiness = this.readinessService.check({
      template,
      scenarioBindings,
      exportPackageBindings,
      controlPlaneWalkthroughResult,
      acceptanceEvaluation,
      riskEvaluation,
    });

    const generatedArtifacts = this.scriptService.generateAll(template);

    const boundScenarioIds = scenarioBindings.filter((binding) => binding.bound).map((binding) => binding.pilotScenarioId);
    const boundExportPackageIds = exportPackageBindings
      .filter((binding) => binding.bound)
      .map((binding) => binding.exportPackageId)
      .filter((id): id is string => id !== undefined);

    const status: PilotKitStatus = readiness.status === 'not_ready' ? 'failed_readiness' : readiness.status === 'ready_with_warnings' ? 'ready' : 'validated';

    const kit: PilotKit = {
      id: this.ctx.ids.nextId('pilot-kit'),
      templateId: template.id,
      status,
      template,
      boundScenarioIds,
      boundPolicyPackIds: input.boundPolicyPackIds ?? template.policyModel.policyPackIds,
      boundPolicyPackVersionIds: input.boundPolicyPackVersionIds ?? template.policyModel.policyPackVersionIds,
      boundEvidenceProofIds: input.boundEvidenceProofIds ?? template.evidenceModel.evidenceProofIds,
      boundExportPackageIds,
      controlPlaneSnapshotIds: input.controlPlaneSnapshotIds ?? [],
      readiness,
      generatedArtifacts,
      createdAt: this.ctx.clock.now(),
    };

    this.store.saveKit(kit);
    this.store.saveReadinessReport(readiness);
    for (const artifact of generatedArtifacts) {
      this.store.saveGeneratedArtifact(artifact);
    }

    return kit;
  }
}

export function createPilotKitBuilder(
  ctx: PilotRuntimeContext,
  store: PilotTemplateStore,
  scenarioBindingService: PilotScenarioBindingService,
  exportPackageBindingService: PilotExportPackageBindingService,
  controlPlaneWalkthroughService: PilotControlPlaneWalkthroughService,
  acceptanceService: PilotAcceptanceService,
  riskService: PilotRiskService,
  readinessService: PilotReadinessService,
  scriptService: PilotScriptService,
): PilotKitBuilder {
  return new PilotKitBuilder(
    ctx,
    store,
    scenarioBindingService,
    exportPackageBindingService,
    controlPlaneWalkthroughService,
    acceptanceService,
    riskService,
    readinessService,
    scriptService,
  );
}
