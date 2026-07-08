import { createEnterpriseDemoSuite, type EnterpriseDemoSuite } from '../../aoc-enterprise-demo/services/index.js';
import { createExportRuntimeContext, type ExportRuntimeContext } from '../../verifiable-export-package/domain/export-runtime-context.js';
import { createExportPackageRuntime, ExportPackageRuntime } from '../../verifiable-export-package/services/export-package-runtime.js';
import { buildSummaryTextItem } from '../../verifiable-export-package/services/export-package-section-builder.js';
import { mapEvidenceRequirementToItem, mapEvidenceSatisfactionToItem } from '../../verifiable-export-package/integrations/evidence-export-adapter.js';
import { buildEvidenceDemoFixture, type EvidenceDemoFixture } from '../../evidence-source-runtime/fixtures/evidence-demo.fixture.js';
import { BANK_PAYMENTS_PROCUREMENT_DATA_PILOT_TEMPLATE } from '../pilots/bank-payments-procurement-data.pilot.js';
import { createPilotRuntimeContext, type PilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { createPilotRuntime, PilotRuntime } from '../services/pilot-runtime.js';
import type { PilotKit } from '../domain/pilot-kit.js';
import { buildExportPackageIdsByDefinitionId } from './pilot-fixture-support.js';

export const NOW = '2026-01-01T00:00:00.000Z';

export interface BankPaymentsProcurementDataPilotFixture {
  readonly ctx: PilotRuntimeContext;
  readonly runtime: PilotRuntime;
  readonly demoSuite: EnterpriseDemoSuite;
  readonly exportCtx: ExportRuntimeContext;
  readonly exportRuntime: ExportPackageRuntime;
  readonly evidenceFixture: EvidenceDemoFixture;
  readonly kit: PilotKit;
}

/**
 * Composes the Bank pilot template with a real Enterprise Demo suite, a real
 * Verifiable Export Package runtime, and the real Evidence Runtime demo
 * fixture, then builds the resulting `PilotKit`. The audit bundle export
 * package definition is bound to a real `ExportPackageRuntime.createAuditBundle()`
 * call referencing the other real, already-verified packages built for this
 * pilot -- never a fabricated bundle.
 */
export async function buildBankPaymentsProcurementDataPilotFixture(): Promise<BankPaymentsProcurementDataPilotFixture> {
  const template = BANK_PAYMENTS_PROCUREMENT_DATA_PILOT_TEMPLATE;
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
    'bank-action-prepare-invoice-support': [
      mapEvidenceRequirementToItem(exportCtx, evidenceFixture.invoiceRequirement),
      mapEvidenceSatisfactionToItem(exportCtx, evidenceFixture.invoiceSatisfaction),
    ],
  };

  const exportPackageIdsByDefinitionId = buildExportPackageIdsByDefinitionId(exportCtx, exportRuntime, template, scenarioBindings, evidenceItemsByAction);

  const auditBundleDefinition = template.exportPackages.find((definition) => definition.packageType === 'audit_bundle');
  if (auditBundleDefinition !== undefined) {
    const referencedPackageIds = Object.values(exportPackageIdsByDefinitionId);
    const { pkg } = exportRuntime.createAuditBundle({
      title: auditBundleDefinition.name,
      description: auditBundleDefinition.buyerPurpose,
      trustDomainId: template.trustDomainId,
      scope: { trustDomainId: template.trustDomainId, actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
      packageIds: referencedPackageIds,
      sections: [
        {
          type: 'summary',
          required: true,
          items: [buildSummaryTextItem(exportCtx, `Audit bundle covering ${referencedPackageIds.length} real, verified pilot export package(s).`)],
        },
      ],
    });
    exportRuntime.sealPackage(pkg.id);
    exportRuntime.verifyPackage(pkg.id);
    exportPackageIdsByDefinitionId[auditBundleDefinition.id] = pkg.id;
  }

  const kit = await runtime.buildPilotKit({ template, exportPackageIdsByDefinitionId });

  return { ctx, runtime, demoSuite, exportCtx, exportRuntime, evidenceFixture, kit };
}
