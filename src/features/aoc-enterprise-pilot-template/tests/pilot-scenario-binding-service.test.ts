import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEnterpriseDemoSuite } from '../../aoc-enterprise-demo/services/index.js';
import { PilotScenarioBindingService } from '../services/pilot-scenario-binding-service.js';
import { buildMinimalScenario } from '../fixtures/minimal-pilot-template.fixture.js';

describe('PilotScenarioBindingService', () => {
  it('1. binds PilotScenario to Enterprise Demo scenario', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const service = new PilotScenarioBindingService({ registry: demoSuite.registry, runner: demoSuite.runner });
    const result = await service.bindOne(buildMinimalScenario({ demoScenarioId: 'internal-agent-allowed', expectedOutcome: 'executed' }));
    assert.equal(result.bound, true);
    assert.equal(result.status, 'bound');
  });

  it('2. reports missing scenario binding', async () => {
    const service = new PilotScenarioBindingService();
    const { demoScenarioId: _omitted, ...scenarioWithoutDemoId } = buildMinimalScenario();
    const result = await service.bindOne(scenarioWithoutDemoId);
    assert.equal(result.bound, false);
    assert.equal(result.status, 'missing_binding');
  });

  it('3. reports mismatched expected outcome', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const service = new PilotScenarioBindingService({ registry: demoSuite.registry, runner: demoSuite.runner });
    const result = await service.bindOne(buildMinimalScenario({ demoScenarioId: 'internal-agent-allowed', expectedOutcome: 'blocked' }));
    assert.equal(result.bound, false);
    assert.equal(result.status, 'outcome_mismatch');
  });

  it('4. preserves deterministic order', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const service = new PilotScenarioBindingService({ registry: demoSuite.registry, runner: demoSuite.runner });
    const scenarios = [
      buildMinimalScenario({ id: 'scenario-z', demoScenarioId: 'internal-agent-allowed', expectedOutcome: 'executed' }),
      buildMinimalScenario({ id: 'scenario-a', demoScenarioId: 'approval-required-block', expectedOutcome: 'approval_required' }),
    ];
    const results = await service.bindAll(scenarios);
    assert.deepEqual(
      results.map((r) => r.pilotScenarioId),
      ['scenario-z', 'scenario-a'],
    );
  });

  it('5. optionally validates real scenario metadata from fixture (registry only, no runner)', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const service = new PilotScenarioBindingService({ registry: demoSuite.registry });
    const result = await service.bindOne(buildMinimalScenario({ demoScenarioId: 'internal-agent-allowed', expectedOutcome: 'executed' }));
    assert.equal(result.bound, true);
    assert.equal(result.demoRun, undefined);
  });

  it('6. does not fake scenario result (unknown demoScenarioId reports missing binding)', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const service = new PilotScenarioBindingService({ registry: demoSuite.registry, runner: demoSuite.runner });
    const result = await service.bindOne(buildMinimalScenario({ demoScenarioId: 'not-a-real-scenario' }));
    assert.equal(result.bound, false);
    assert.equal(result.status, 'missing_binding');
  });
});
