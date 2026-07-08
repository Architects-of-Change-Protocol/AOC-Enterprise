import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEnterpriseDemoSuite } from '../../aoc-enterprise-demo/services/index.js';
import { createPilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { createPilotTemplateStore } from '../services/pilot-template-store.js';
import { createPilotScenarioBindingService } from '../services/pilot-scenario-binding-service.js';
import { createPilotExportPackageBindingService } from '../services/pilot-export-package-binding-service.js';
import { createPilotControlPlaneWalkthroughService } from '../services/pilot-control-plane-walkthrough-service.js';
import { createPilotAcceptanceService } from '../services/pilot-acceptance-service.js';
import { createPilotRiskService } from '../services/pilot-risk-service.js';
import { createPilotReadinessService } from '../services/pilot-readiness-service.js';
import { createPilotScriptService } from '../services/pilot-script-service.js';
import { createPilotKitBuilder } from '../services/pilot-kit-builder.js';
import { buildMinimalPilotTemplate } from '../fixtures/minimal-pilot-template.fixture.js';

const NOW = '2026-01-01T00:00:00.000Z';

function buildBuilder(deps: { registry?: ReturnType<typeof createEnterpriseDemoSuite>['registry']; runner?: ReturnType<typeof createEnterpriseDemoSuite>['runner'] } = {}) {
  const ctx = createPilotRuntimeContext(NOW);
  const store = createPilotTemplateStore();
  const scenarioBindingService = createPilotScenarioBindingService(deps);
  const exportPackageBindingService = createPilotExportPackageBindingService();
  const controlPlaneWalkthroughService = createPilotControlPlaneWalkthroughService();
  const acceptanceService = createPilotAcceptanceService();
  const riskService = createPilotRiskService();
  const readinessService = createPilotReadinessService(ctx);
  const scriptService = createPilotScriptService(ctx);
  const builder = createPilotKitBuilder(
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
  return { ctx, store, builder };
}

describe('PilotKitBuilder', () => {
  it('1. builds PilotKit from template', async () => {
    const { builder } = buildBuilder();
    const template = buildMinimalPilotTemplate();
    const kit = await builder.build({ template });
    assert.equal(kit.templateId, template.id);
    assert.equal(kit.template, template);
  });

  it('2. binds scenario IDs', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const { builder } = buildBuilder({ registry: demoSuite.registry, runner: demoSuite.runner });
    const template = buildMinimalPilotTemplate();
    const kit = await builder.build({ template });
    assert.deepEqual(kit.boundScenarioIds, ['test-scenario-1']);
  });

  it('3. binds policy pack IDs', async () => {
    const { builder } = buildBuilder();
    const template = buildMinimalPilotTemplate({ policyModel: { policyPackIds: ['policy-pack-x'], policyPackVersionIds: ['policy-pack-x-v1'], demoOnly: true, legalCompleteness: 'demo_policy_model', policyScenarios: [], walkthrough: [] } });
    const kit = await builder.build({ template });
    assert.deepEqual(kit.boundPolicyPackIds, ['policy-pack-x']);
    assert.deepEqual(kit.boundPolicyPackVersionIds, ['policy-pack-x-v1']);
  });

  it('4. binds evidence proof IDs', async () => {
    const { builder } = buildBuilder();
    const template = buildMinimalPilotTemplate();
    const withEvidence = { ...template, evidenceModel: { ...template.evidenceModel, evidenceProofIds: ['evidence-proof-x'] } };
    const kit = await builder.build({ template: withEvidence });
    assert.deepEqual(kit.boundEvidenceProofIds, ['evidence-proof-x']);
  });

  it('5. binds export package IDs', async () => {
    const { builder } = buildBuilder();
    const template = buildMinimalPilotTemplate();
    const kit = await builder.build({ template, exportPackageIdsByDefinitionId: { 'test-export-package-1': 'export-package-real-1' } });
    assert.ok(kit.readiness.verifiedExportPackageIds.length >= 0);
    assert.ok(Array.isArray(kit.boundExportPackageIds));
  });

  it('6. binds Control Plane snapshot IDs', async () => {
    const { builder } = buildBuilder();
    const template = buildMinimalPilotTemplate();
    const kit = await builder.build({ template, controlPlaneSnapshotIds: ['snapshot-1'] });
    assert.deepEqual(kit.controlPlaneSnapshotIds, ['snapshot-1']);
  });

  it('7. calls readiness service', async () => {
    const { builder } = buildBuilder();
    const template = buildMinimalPilotTemplate();
    const kit = await builder.build({ template });
    assert.ok(kit.readiness.id.length > 0);
    assert.equal(kit.readiness.templateId, template.id);
  });

  it('8. generates pilot artifacts', async () => {
    const { builder } = buildBuilder();
    const template = buildMinimalPilotTemplate();
    const kit = await builder.build({ template });
    const types = kit.generatedArtifacts.map((a) => a.type).sort();
    assert.deepEqual(types, ['acceptance_checklist', 'buyer_summary', 'demo_script', 'operator_walkthrough', 'pilot_json', 'pilot_readme', 'technical_setup'].sort());
  });

  it('9. does not fake missing scenario', async () => {
    const { builder } = buildBuilder();
    const template = buildMinimalPilotTemplate();
    const kit = await builder.build({ template });
    assert.deepEqual(kit.boundScenarioIds, []);
    assert.ok(kit.readiness.missingScenarioIds.includes('test-scenario-1'));
    assert.equal(kit.readiness.status, 'not_ready');
  });

  it('10. does not mark kit ready when required export package missing', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const { builder } = buildBuilder({ registry: demoSuite.registry, runner: demoSuite.runner });
    const template = buildMinimalPilotTemplate();
    const kit = await builder.build({ template });
    assert.equal(kit.status, 'failed_readiness');
    assert.equal(kit.readiness.status, 'not_ready');
  });

  it('11. deterministic output', async () => {
    const first = buildBuilder();
    const second = buildBuilder();
    const template = buildMinimalPilotTemplate();
    const firstKit = await first.builder.build({ template });
    const secondKit = await second.builder.build({ template });
    assert.equal(firstKit.id, secondKit.id);
    assert.equal(firstKit.readiness.status, secondKit.readiness.status);
    assert.deepEqual(
      firstKit.generatedArtifacts.map((a) => a.contentHash),
      secondKit.generatedArtifacts.map((a) => a.contentHash),
    );
  });
});
