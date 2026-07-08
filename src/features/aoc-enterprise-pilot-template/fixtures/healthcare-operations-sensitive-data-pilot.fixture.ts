import { createEnterpriseDemoSuite, type EnterpriseDemoSuite } from '../../aoc-enterprise-demo/services/index.js';
import { createExportRuntimeContext, type ExportRuntimeContext } from '../../verifiable-export-package/domain/export-runtime-context.js';
import { createExportPackageRuntime, ExportPackageRuntime } from '../../verifiable-export-package/services/export-package-runtime.js';
import { mapEvidenceRequirementToItem } from '../../verifiable-export-package/integrations/evidence-export-adapter.js';
import { buildEvidenceDemoFixture, type EvidenceDemoFixture } from '../../evidence-source-runtime/fixtures/evidence-demo.fixture.js';
import { HEALTHCARE_OPERATIONS_SENSITIVE_DATA_PILOT_TEMPLATE } from '../pilots/healthcare-operations-sensitive-data.pilot.js';
import { createPilotRuntimeContext, type PilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { createPilotRuntime, PilotRuntime } from '../services/pilot-runtime.js';
import type { PilotKit } from '../domain/pilot-kit.js';
import { buildExportPackageIdsByDefinitionId } from './pilot-fixture-support.js';

export const NOW = '2026-01-01T00:00:00.000Z';

export interface HealthcareOperationsSensitiveDataPilotFixture {
  readonly ctx: PilotRuntimeContext;
  readonly runtime: PilotRuntime;
  readonly demoSuite: EnterpriseDemoSuite;
  readonly exportCtx: ExportRuntimeContext;
  readonly exportRuntime: ExportPackageRuntime;
  readonly evidenceFixture: EvidenceDemoFixture;
  readonly kit: PilotKit;
}

/**
 * Composes the Healthcare pilot template with a real Enterprise Demo suite,
 * a real Verifiable Export Package runtime, and the real Evidence Runtime
 * demo fixture, then builds the resulting `PilotKit`. Never claims HIPAA,
 * GDPR, or any other healthcare regulatory compliance -- see the template's
 * own `legalDisclaimer` and `nonGoals`.
 */
export async function buildHealthcareOperationsSensitiveDataPilotFixture(): Promise<HealthcareOperationsSensitiveDataPilotFixture> {
  const template = HEALTHCARE_OPERATIONS_SENSITIVE_DATA_PILOT_TEMPLATE;
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

  runtime.registerTemplate(template);

  const scenarioBindings = await runtime.scenarioBindingService.bindAll(template.scenarios);

  const evidenceItemsByAction: Record<string, readonly (ReturnType<typeof mapEvidenceRequirementToItem>)[]> = {
    'healthcare-action-prepare-handoff-support': [mapEvidenceRequirementToItem(exportCtx, evidenceFixture.dataClassificationRequirement)],
  };

  const exportPackageIdsByDefinitionId = buildExportPackageIdsByDefinitionId(exportCtx, exportRuntime, template, scenarioBindings, evidenceItemsByAction);

  const kit = await runtime.buildPilotKit({ template, exportPackageIdsByDefinitionId });

  return { ctx, runtime, demoSuite, exportCtx, exportRuntime, evidenceFixture, kit };
}
