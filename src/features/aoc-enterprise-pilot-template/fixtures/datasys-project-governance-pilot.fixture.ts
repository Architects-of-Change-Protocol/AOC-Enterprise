import { createEnterpriseDemoSuite, type EnterpriseDemoSuite } from '../../aoc-enterprise-demo/services/index.js';
import { createExportRuntimeContext, type ExportRuntimeContext } from '../../verifiable-export-package/domain/export-runtime-context.js';
import { createExportPackageRuntime, ExportPackageRuntime } from '../../verifiable-export-package/services/export-package-runtime.js';
import { mapEvidenceRequirementToItem, mapEvidenceSatisfactionToItem } from '../../verifiable-export-package/integrations/evidence-export-adapter.js';
import { buildEvidenceDemoFixture, type EvidenceDemoFixture } from '../../evidence-source-runtime/fixtures/evidence-demo.fixture.js';
import { DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE } from '../pilots/datasys-project-governance.pilot.js';
import { createPilotRuntimeContext, type PilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { createPilotRuntime, PilotRuntime } from '../services/pilot-runtime.js';
import type { PilotKit } from '../domain/pilot-kit.js';
import { buildExportPackageIdsByDefinitionId } from './pilot-fixture-support.js';

export const NOW = '2026-01-01T00:00:00.000Z';

export interface DatasysProjectGovernancePilotFixture {
  readonly ctx: PilotRuntimeContext;
  readonly runtime: PilotRuntime;
  readonly demoSuite: EnterpriseDemoSuite;
  readonly exportCtx: ExportRuntimeContext;
  readonly exportRuntime: ExportPackageRuntime;
  readonly evidenceFixture: EvidenceDemoFixture;
  readonly kit: PilotKit;
}

/**
 * Composes the Datasys pilot template with a real Enterprise Demo suite
 * (for scenario bindings), a real Verifiable Export Package runtime (for
 * export package bindings), and the real Evidence Runtime demo fixture --
 * then builds the resulting `PilotKit` through the real `PilotRuntime`.
 * Nothing here fabricates a scenario outcome, export package, or evidence
 * record; every one is produced by its owning runtime.
 */
export async function buildDatasysProjectGovernancePilotFixture(): Promise<DatasysProjectGovernancePilotFixture> {
  const ctx = createPilotRuntimeContext(NOW);
  const demoSuite = createEnterpriseDemoSuite();
  const exportCtx = createExportRuntimeContext(NOW);
  const exportRuntime = createExportPackageRuntime(exportCtx);
  const evidenceFixture = buildEvidenceDemoFixture();

  const runtime = createPilotRuntime(ctx, {
    demoScenarioRegistry: demoSuite.registry,
    demoScenarioRunner: demoSuite.runner,
    exportPackageRuntime: exportRuntime,
  });

  runtime.registerTemplate(DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE);

  const scenarioBindings = await runtime.scenarioBindingService.bindAll(DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE.scenarios);

  const evidenceItemsByAction: Record<string, readonly (ReturnType<typeof mapEvidenceRequirementToItem>)[]> = {
    'datasys-action-prepare-invoice-support': [
      mapEvidenceRequirementToItem(exportCtx, evidenceFixture.invoiceRequirement),
      mapEvidenceSatisfactionToItem(exportCtx, evidenceFixture.invoiceSatisfaction),
    ],
  };

  const exportPackageIdsByDefinitionId = buildExportPackageIdsByDefinitionId(
    exportCtx,
    exportRuntime,
    DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE,
    scenarioBindings,
    evidenceItemsByAction,
  );

  const kit = await runtime.buildPilotKit({
    template: DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE,
    exportPackageIdsByDefinitionId,
  });

  return { ctx, runtime, demoSuite, exportCtx, exportRuntime, evidenceFixture, kit };
}
