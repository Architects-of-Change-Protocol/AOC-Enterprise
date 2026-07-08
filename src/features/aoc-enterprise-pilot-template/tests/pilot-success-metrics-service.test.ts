import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PilotSuccessMetricsService } from '../services/pilot-success-metrics-service.js';
import { buildMinimalSuccessMetric, buildMinimalReadinessReport } from '../fixtures/minimal-pilot-template.fixture.js';
import type { PilotSuccessMetricCategory } from '../domain/pilot-success-metric.js';
import type { PilotScenarioBindingResult } from '../services/pilot-scenario-binding-service.js';
import type { PilotExportPackageBindingResult } from '../services/pilot-export-package-binding-service.js';

const CATEGORIES: readonly PilotSuccessMetricCategory[] = [
  'risk_reduction',
  'auditability',
  'operator_visibility',
  'execution_safety',
  'policy_enforcement',
  'evidence_readiness',
  'buyer_confidence',
];

function boundScenario(bound: boolean): PilotScenarioBindingResult {
  return { pilotScenarioId: 's1', status: bound ? 'bound' : 'missing_binding', bound, reason: 'r' };
}

function boundExport(bound: boolean): PilotExportPackageBindingResult {
  return { pilotExportPackageDefinitionId: 'e1', exportPackageId: 'pkg-1', status: bound ? 'bound' : 'mismatched', bound, reason: 'r' };
}

describe('PilotSuccessMetricsService', () => {
  it('1. computes target-defined metrics', () => {
    const service = new PilotSuccessMetricsService();
    const metric = buildMinimalSuccessMetric({ targetValue: '100% of X' });
    const report = service.compute([metric], [], [], undefined);
    assert.equal(report.evaluations[0]?.targetValue, '100% of X');
  });

  for (const category of CATEGORIES) {
    it(`includes ${category} metric`, () => {
      const service = new PilotSuccessMetricsService();
      const metric = buildMinimalSuccessMetric({ id: `metric-${category}`, category });
      const report = service.compute([metric], [boundScenario(true)], [boundExport(true)], buildMinimalReadinessReport());
      const evaluation = report.evaluations.find((e) => e.metricId === `metric-${category}`);
      if (evaluation === undefined) {
        throw new Error(`Expected an evaluation for metric-${category}.`);
      }
      assert.ok(evaluation.currentSignal.length > 0);
    });
  }

  it('9. does not invent customer KPI values', () => {
    const service = new PilotSuccessMetricsService();
    const metric = buildMinimalSuccessMetric({ targetValue: 'target-defined, not measured' });
    const report = service.compute([metric], [boundScenario(true), boundScenario(false)], [], undefined);
    assert.equal(report.evaluations[0]?.targetValue, 'target-defined, not measured');
    assert.ok(report.evaluations[0]?.currentSignal.includes('1/2'));
  });

  it('10. deterministic output', () => {
    const service = new PilotSuccessMetricsService();
    const metrics = [buildMinimalSuccessMetric()];
    const scenarioBindings = [boundScenario(true)];
    const exportBindings = [boundExport(true)];
    const readiness = buildMinimalReadinessReport();
    assert.deepEqual(service.compute(metrics, scenarioBindings, exportBindings, readiness), service.compute(metrics, scenarioBindings, exportBindings, readiness));
  });
});
