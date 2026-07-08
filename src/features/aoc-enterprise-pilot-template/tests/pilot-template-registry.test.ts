import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PilotTemplateStore } from '../services/pilot-template-store.js';
import { PilotTemplateRegistry, validatePilotTemplate } from '../services/pilot-template-registry.js';
import { buildMinimalPilotTemplate } from '../fixtures/minimal-pilot-template.fixture.js';
import { DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE } from '../pilots/datasys-project-governance.pilot.js';

describe('PilotTemplateRegistry', () => {
  it('1. registers built-in pilot template', () => {
    const registry = new PilotTemplateRegistry(new PilotTemplateStore());
    const result = registry.registerBuiltIn(DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE);
    assert.equal(result.valid, true);
  });

  it('2. registers custom pilot template', () => {
    const registry = new PilotTemplateRegistry(new PilotTemplateStore());
    const template = buildMinimalPilotTemplate({ id: 'bank-payments-procurement-data' });
    const result = registry.registerCustom(template);
    assert.equal(result.valid, true);
  });

  it('3. rejects duplicate template ID', () => {
    const store = new PilotTemplateStore();
    const registry = new PilotTemplateRegistry(store);
    registry.registerCustom(buildMinimalPilotTemplate());
    assert.throws(() => registry.registerCustom(buildMinimalPilotTemplate()));
  });

  it('4. validates legal disclaimer exists', () => {
    const result = validatePilotTemplate(buildMinimalPilotTemplate({ legalDisclaimer: '' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.toLowerCase().includes('legal disclaimer')));
  });

  it('5. validates non-goals exist', () => {
    const result = validatePilotTemplate(buildMinimalPilotTemplate({ nonGoals: [] }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.toLowerCase().includes('non-goals')));
  });

  it('6. validates acceptance criteria exist', () => {
    const result = validatePilotTemplate(buildMinimalPilotTemplate({ acceptanceCriteria: [] }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.toLowerCase().includes('acceptance criteria')));
  });

  it('7. validates success metrics exist', () => {
    const result = validatePilotTemplate(buildMinimalPilotTemplate({ successMetrics: [] }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.toLowerCase().includes('success metrics')));
  });

  it('8. validates at least one scenario exists', () => {
    const result = validatePilotTemplate(buildMinimalPilotTemplate({ scenarios: [] }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.toLowerCase().includes('scenario')));
  });

  it('9. validates at least one export package definition exists', () => {
    const result = validatePilotTemplate(buildMinimalPilotTemplate({ exportPackages: [] }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.toLowerCase().includes('export package')));
  });

  it('10. marks complete template ready', () => {
    const store = new PilotTemplateStore();
    const registry = new PilotTemplateRegistry(store);
    registry.registerCustom(buildMinimalPilotTemplate({ status: 'draft' }));
    assert.equal(store.getTemplate('datasys-project-governance')?.status, 'ready');
  });

  it('11. deterministic validation', () => {
    const template = buildMinimalPilotTemplate();
    const first = validatePilotTemplate(template);
    const second = validatePilotTemplate(template);
    assert.deepEqual(first, second);
  });
});
