import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PilotTemplateStore } from '../services/pilot-template-store.js';
import { buildMinimalPilotTemplate, buildMinimalPilotKit, buildMinimalReadinessReport, buildMinimalGeneratedArtifact } from '../fixtures/minimal-pilot-template.fixture.js';
import type { PilotPersona } from '../domain/pilot-persona.js';

function buildPersona(overrides: Partial<PilotPersona> = {}): PilotPersona {
  return {
    id: 'persona-test-1',
    type: 'buyer',
    title: 'Test Buyer',
    description: 'A test persona.',
    concerns: ['concern'],
    successQuestions: ['question'],
    messages: ['message'],
    ...overrides,
  };
}

describe('PilotTemplateStore', () => {
  it('1. stores and retrieves PilotTemplate', () => {
    const store = new PilotTemplateStore();
    const template = buildMinimalPilotTemplate();
    store.saveTemplate(template);
    assert.deepEqual(store.getTemplate(template.id), template);
  });

  it('2. stores and retrieves PilotKit', () => {
    const store = new PilotTemplateStore();
    const kit = buildMinimalPilotKit();
    store.saveKit(kit);
    assert.deepEqual(store.getKit(kit.id), kit);
  });

  it('3. stores and retrieves PilotPersona', () => {
    const store = new PilotTemplateStore();
    const persona = buildPersona();
    store.savePersona(persona);
    assert.deepEqual(store.getPersona(persona.id), persona);
  });

  it('4. stores and retrieves PilotReadinessReport', () => {
    const store = new PilotTemplateStore();
    const report = buildMinimalReadinessReport();
    store.saveReadinessReport(report);
    assert.deepEqual(store.getReadinessReport(report.id), report);
  });

  it('5. stores and retrieves PilotGeneratedArtifact', () => {
    const store = new PilotTemplateStore();
    const artifact = buildMinimalGeneratedArtifact();
    store.saveGeneratedArtifact(artifact);
    assert.deepEqual(store.getGeneratedArtifact(artifact.id), artifact);
  });

  it('6. queries templates by industry', () => {
    const store = new PilotTemplateStore();
    store.saveTemplate(buildMinimalPilotTemplate({ id: 'datasys-project-governance', industry: 'technology_services' }));
    store.saveTemplate(buildMinimalPilotTemplate({ id: 'bank-payments-procurement-data', industry: 'banking' }));
    assert.deepEqual(
      store.listTemplatesByIndustry('banking').map((t) => t.id),
      ['bank-payments-procurement-data'],
    );
  });

  it('7. queries templates by status', () => {
    const store = new PilotTemplateStore();
    store.saveTemplate(buildMinimalPilotTemplate({ id: 'datasys-project-governance', status: 'draft' }));
    store.saveTemplate(buildMinimalPilotTemplate({ id: 'bank-payments-procurement-data', status: 'ready' }));
    assert.deepEqual(
      store.listTemplatesByStatus('ready').map((t) => t.id),
      ['bank-payments-procurement-data'],
    );
  });

  it('8. queries templates by use case', () => {
    const store = new PilotTemplateStore();
    store.saveTemplate(buildMinimalPilotTemplate({ id: 'datasys-project-governance', primaryUseCase: 'project governance' }));
    store.saveTemplate(buildMinimalPilotTemplate({ id: 'bank-payments-procurement-data', primaryUseCase: 'payments and procurement' }));
    assert.deepEqual(
      store.listTemplatesByUseCase('payments').map((t) => t.id),
      ['bank-payments-procurement-data'],
    );
  });

  it('9. queries pilot kits by template', () => {
    const store = new PilotTemplateStore();
    const templateA = buildMinimalPilotTemplate({ id: 'datasys-project-governance' });
    const templateB = buildMinimalPilotTemplate({ id: 'bank-payments-procurement-data' });
    store.saveKit(buildMinimalPilotKit({ id: 'kit-a', template: templateA, templateId: templateA.id }));
    store.saveKit(buildMinimalPilotKit({ id: 'kit-b', template: templateB, templateId: templateB.id }));
    assert.deepEqual(
      store.listKitsByTemplate('bank-payments-procurement-data').map((k) => k.id),
      ['kit-b'],
    );
  });

  it('10. preserves deterministic ordering', () => {
    const store = new PilotTemplateStore();
    store.saveTemplate(buildMinimalPilotTemplate({ id: 'sports-event-settlement' }));
    store.saveTemplate(buildMinimalPilotTemplate({ id: 'bank-payments-procurement-data' }));
    store.saveTemplate(buildMinimalPilotTemplate({ id: 'datasys-project-governance' }));
    assert.deepEqual(
      store.listTemplates().map((t) => t.id),
      ['bank-payments-procurement-data', 'datasys-project-governance', 'sports-event-settlement'],
    );
  });

  it('11. updates template status', () => {
    const store = new PilotTemplateStore();
    store.saveTemplate(buildMinimalPilotTemplate({ status: 'draft' }));
    const updated = store.updateTemplateStatus('datasys-project-governance', 'ready', '2026-02-01T00:00:00.000Z');
    assert.equal(updated?.status, 'ready');
    assert.equal(updated?.updatedAt, '2026-02-01T00:00:00.000Z');
  });

  it('12. updates pilot kit status', () => {
    const store = new PilotTemplateStore();
    const kit = buildMinimalPilotKit({ status: 'assembled' });
    store.saveKit(kit);
    const updated = store.updateKitStatus(kit.id, 'ready');
    assert.equal(updated?.status, 'ready');
  });
});
