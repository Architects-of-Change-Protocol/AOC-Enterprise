import { createEnterpriseDemoSuite, type EnterpriseDemoSuite } from '../../aoc-enterprise-demo/services/index.js';
import { createExportRuntimeContext, type ExportRuntimeContext } from '../../verifiable-export-package/domain/export-runtime-context.js';
import { createExportPackageRuntime, ExportPackageRuntime } from '../../verifiable-export-package/services/export-package-runtime.js';
import { mapEvidenceRequirementToItem, mapEvidenceSatisfactionToItem } from '../../verifiable-export-package/integrations/evidence-export-adapter.js';
import { buildEvidenceDemoFixture, type EvidenceDemoFixture } from '../../evidence-source-runtime/fixtures/evidence-demo.fixture.js';
import { SPORTS_EVENT_SETTLEMENT_PILOT_TEMPLATE } from '../pilots/sports-event-settlement.pilot.js';
import { createPilotRuntimeContext, type PilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { createPilotRuntime, PilotRuntime } from '../services/pilot-runtime.js';
import type { PilotKit } from '../domain/pilot-kit.js';
import { buildExportPackageIdsByDefinitionId } from './pilot-fixture-support.js';

export const NOW = '2026-01-01T00:00:00.000Z';

export interface SportsEventSettlementPilotFixture {
  readonly ctx: PilotRuntimeContext;
  readonly runtime: PilotRuntime;
  readonly demoSuite: EnterpriseDemoSuite;
  readonly exportCtx: ExportRuntimeContext;
  readonly exportRuntime: ExportPackageRuntime;
  readonly evidenceFixture: EvidenceDemoFixture;
  readonly kit: PilotKit;
}

/**
 * Composes the Sports Event Settlement pilot template with a real
 * Enterprise Demo suite, a real Verifiable Export Package runtime, and the
 * real Evidence Runtime demo fixture (including its real, already-satisfied
 * `eventRecordRequirement`/`eventRecordSatisfaction`), then builds the
 * resulting `PilotKit`. Never claims smart-contract legal enforceability or
 * payment regulatory compliance -- see the template's own `legalDisclaimer`.
 */
export async function buildSportsEventSettlementPilotFixture(): Promise<SportsEventSettlementPilotFixture> {
  const template = SPORTS_EVENT_SETTLEMENT_PILOT_TEMPLATE;
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
    'sports-action-settle-payment-missing-evidence': [
      mapEvidenceRequirementToItem(exportCtx, evidenceFixture.eventRecordRequirement),
      mapEvidenceSatisfactionToItem(exportCtx, evidenceFixture.eventRecordSatisfaction),
    ],
  };

  const exportPackageIdsByDefinitionId = buildExportPackageIdsByDefinitionId(exportCtx, exportRuntime, template, scenarioBindings, evidenceItemsByAction);

  const kit = await runtime.buildPilotKit({ template, exportPackageIdsByDefinitionId });

  return { ctx, runtime, demoSuite, exportCtx, exportRuntime, evidenceFixture, kit };
}
