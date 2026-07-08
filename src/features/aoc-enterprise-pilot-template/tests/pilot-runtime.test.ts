import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEnterpriseDemoSuite } from '../../aoc-enterprise-demo/services/index.js';
import { createPilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { createPilotRuntime } from '../services/pilot-runtime.js';
import { buildMinimalPilotTemplate, buildMinimalScenario, buildMinimalExportPackageDefinition } from '../fixtures/minimal-pilot-template.fixture.js';

const NOW = '2026-01-01T00:00:00.000Z';

describe('PilotRuntime', () => {
  it('1. registers template', () => {
    const runtime = createPilotRuntime(createPilotRuntimeContext(NOW));
    const result = runtime.registerTemplate(buildMinimalPilotTemplate());
    assert.equal(result.valid, true);
  });

  it('2. lists templates', () => {
    const runtime = createPilotRuntime(createPilotRuntimeContext(NOW));
    runtime.registerTemplate(buildMinimalPilotTemplate());
    assert.deepEqual(
      runtime.listTemplates().map((t) => t.id),
      ['datasys-project-governance'],
    );
  });

  it('3. gets template', () => {
    const runtime = createPilotRuntime(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    runtime.registerTemplate(template);
    assert.equal(runtime.getTemplate('datasys-project-governance')?.name, template.name);
  });

  it('4. builds pilot kit', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const runtime = createPilotRuntime(createPilotRuntimeContext(NOW), { demoScenarioRegistry: demoSuite.registry, demoScenarioRunner: demoSuite.runner });
    const template = buildMinimalPilotTemplate();
    runtime.registerTemplate(template);
    const kit = await runtime.buildPilotKit({ template });
    assert.equal(kit.templateId, 'datasys-project-governance');
  });

  it('5. gets pilot kit', async () => {
    const runtime = createPilotRuntime(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    runtime.registerTemplate(template);
    const kit = await runtime.buildPilotKit({ template });
    assert.equal(runtime.getPilotKit(kit.id)?.id, kit.id);
  });

  it('6. checks readiness', async () => {
    const runtime = createPilotRuntime(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    runtime.registerTemplate(template);
    const kit = await runtime.buildPilotKit({ template });
    assert.equal(runtime.checkReadiness(kit.id).id, kit.readiness.id);
  });

  it('7. generates artifacts', () => {
    const runtime = createPilotRuntime(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    runtime.registerTemplate(template);
    const artifacts = runtime.generateArtifacts('datasys-project-governance');
    assert.equal(artifacts.length, 7);
  });

  it('8. binds scenario', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const runtime = createPilotRuntime(createPilotRuntimeContext(NOW), { demoScenarioRegistry: demoSuite.registry, demoScenarioRunner: demoSuite.runner });
    const result = await runtime.bindScenario(buildMinimalScenario({ demoScenarioId: 'internal-agent-allowed', expectedOutcome: 'executed' }));
    assert.equal(result.bound, true);
  });

  it('9. binds export package', () => {
    const runtime = createPilotRuntime(createPilotRuntimeContext(NOW));
    const result = runtime.bindExportPackage(buildMinimalExportPackageDefinition(), 'some-package-id');
    assert.equal(result.status, 'missing_package');
  });

  it('10. queries templates', () => {
    const runtime = createPilotRuntime(createPilotRuntimeContext(NOW));
    runtime.registerTemplate(buildMinimalPilotTemplate());
    assert.deepEqual(
      runtime.queryTemplates({ industry: 'technology_services' }).map((t) => t.id),
      ['datasys-project-governance'],
    );
  });
});
