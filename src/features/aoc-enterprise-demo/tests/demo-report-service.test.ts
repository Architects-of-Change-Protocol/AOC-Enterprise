import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../services/index.js';
import { createDemoReportService } from '../services/demo-report-service.js';

describe('DemoReportService', () => {
  it('creates an aggregate report across all registered scenarios', async () => {
    const suite = createEnterpriseDemoSuite();
    const scenarios = suite.registry.listScenarios();
    const runs = [];
    for (const scenario of scenarios) {
      runs.push(await suite.runner.runScenario(scenario.id));
    }
    const report = createDemoReportService().buildReport(runs, () => '2026-01-01T00:00:00.000Z');
    assert.equal(report.totalScenarios, 10);
    assert.equal(report.entries.length, 10);
  });

  it('includes pass/fail counts', async () => {
    const suite = createEnterpriseDemoSuite();
    const scenarios = suite.registry.listScenarios();
    const runs = [];
    for (const scenario of scenarios) {
      runs.push(await suite.runner.runScenario(scenario.id));
    }
    const report = createDemoReportService().buildReport(runs, () => '2026-01-01T00:00:00.000Z');
    assert.equal(report.passedCount + report.failedCount, report.totalScenarios);
    assert.equal(report.passedCount, 10);
    assert.equal(report.failedCount, 0);
  });

  it('reports demo readiness only when every scenario passed', async () => {
    const suite = createEnterpriseDemoSuite();
    const scenarios = suite.registry.listScenarios();
    const runs = [];
    for (const scenario of scenarios) {
      runs.push(await suite.runner.runScenario(scenario.id));
    }
    const report = createDemoReportService().buildReport(runs, () => '2026-01-01T00:00:00.000Z');
    assert.equal(report.demoReady, true);
  });

  it('reports not demo-ready with no runs', () => {
    const report = createDemoReportService().buildReport([], () => '2026-01-01T00:00:00.000Z');
    assert.equal(report.demoReady, false);
    assert.deepEqual(report.warnings, []);
  });

  it('lists a warning for every failed assertion', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const report = createDemoReportService().buildReport([run], () => '2026-01-01T00:00:00.000Z');
    assert.deepEqual(report.warnings, []);
  });

  it('lists a scenario summary entry per run', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const report = createDemoReportService().buildReport([run], () => '2026-01-01T00:00:00.000Z');
    const entry = report.entries[0]!;
    assert.equal(entry.scenarioId, 'internal-agent-allowed');
    assert.equal(entry.outcomeStatus, 'executed');
    assert.equal(entry.executorRan, true);
    assert.equal(entry.proofChainComplete, true);
  });

  it('is deterministic for the same runs and clock', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const reportService = createDemoReportService();
    const first = reportService.buildReport([run], () => '2026-01-01T00:00:00.000Z');
    const second = reportService.buildReport([run], () => '2026-01-01T00:00:00.000Z');
    assert.deepEqual(first, second);
  });
});
