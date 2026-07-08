import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { PilotReadinessService } from '../services/pilot-readiness-service.js';
import { buildMinimalPilotTemplate } from '../fixtures/minimal-pilot-template.fixture.js';
import type { PilotScenarioBindingResult } from '../services/pilot-scenario-binding-service.js';
import type { PilotExportPackageBindingResult } from '../services/pilot-export-package-binding-service.js';

const NOW = '2026-01-01T00:00:00.000Z';

function boundScenario(bound: boolean): PilotScenarioBindingResult {
  return { pilotScenarioId: 'test-scenario-1', status: bound ? 'bound' : 'missing_binding', bound, reason: 'r' };
}

function boundExport(bound: boolean): PilotExportPackageBindingResult {
  return { pilotExportPackageDefinitionId: 'test-export-package-1', exportPackageId: 'pkg-1', status: bound ? 'bound' : 'mismatched', bound, reason: 'r' };
}

describe('PilotReadinessService', () => {
  it('1. ready when template complete and automated requirements pass', () => {
    const service = new PilotReadinessService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    const report = service.check({ template, scenarioBindings: [boundScenario(true)], exportPackageBindings: [boundExport(true)] });
    assert.equal(report.status, 'ready');
  });

  it('2. ready_with_warnings when only manual/customer signoff remains', () => {
    const service = new PilotReadinessService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    const report = service.check({
      template,
      scenarioBindings: [boundScenario(true)],
      exportPackageBindings: [boundExport(true)],
      acceptanceEvaluation: { results: [], passedCriteriaIds: [], failedCriteriaIds: [], warningCriteriaIds: ['customer-signoff-1'] },
    });
    assert.equal(report.status, 'ready_with_warnings');
  });

  it('3. not_ready when required scenario missing', () => {
    const service = new PilotReadinessService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    const report = service.check({ template, scenarioBindings: [boundScenario(false)], exportPackageBindings: [boundExport(true)] });
    assert.equal(report.status, 'not_ready');
    assert.deepEqual(report.missingScenarioIds, ['test-scenario-1']);
  });

  it('4. not_ready when export package missing', () => {
    const service = new PilotReadinessService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    const report = service.check({ template, scenarioBindings: [boundScenario(true)], exportPackageBindings: [boundExport(false)] });
    assert.equal(report.status, 'not_ready');
  });

  it('5. not_ready when legal disclaimer missing', () => {
    const service = new PilotReadinessService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate({ legalDisclaimer: '' });
    const report = service.check({ template, scenarioBindings: [boundScenario(true)], exportPackageBindings: [boundExport(true)] });
    assert.equal(report.status, 'not_ready');
    assert.ok(report.issues.some((i) => i.reasonCode === 'TEMPLATE_INCOMPLETE'));
  });

  it('6. not_ready when acceptance criteria missing', () => {
    const service = new PilotReadinessService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate({ acceptanceCriteria: [] });
    const report = service.check({ template, scenarioBindings: [boundScenario(true)], exportPackageBindings: [boundExport(true)] });
    assert.equal(report.status, 'not_ready');
  });

  it('7. not_ready when success metrics missing', () => {
    const service = new PilotReadinessService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate({ successMetrics: [] });
    const report = service.check({ template, scenarioBindings: [boundScenario(true)], exportPackageBindings: [boundExport(true)] });
    assert.equal(report.status, 'not_ready');
  });

  it('8. includes issues', () => {
    const service = new PilotReadinessService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate({ legalDisclaimer: '' });
    const report = service.check({ template, scenarioBindings: [boundScenario(false)], exportPackageBindings: [boundExport(false)] });
    assert.ok(report.issues.length >= 3);
  });

  it('9. deterministic report', () => {
    const template = buildMinimalPilotTemplate();
    const input = { template, scenarioBindings: [boundScenario(true)], exportPackageBindings: [boundExport(true)] };
    const first = new PilotReadinessService(createPilotRuntimeContext(NOW)).check(input);
    const second = new PilotReadinessService(createPilotRuntimeContext(NOW)).check(input);
    assert.equal(first.status, second.status);
    assert.deepEqual(first.issues, second.issues);
  });
});
