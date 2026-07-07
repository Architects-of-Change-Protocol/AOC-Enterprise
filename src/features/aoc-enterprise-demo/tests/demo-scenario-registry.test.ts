import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ALL_DEMO_SCENARIOS } from '../scenarios/index.js';
import { createDemoScenarioRegistry, DemoScenarioValidationError } from '../services/demo-scenario-registry.js';
import type { DemoScenario, DemoScenarioId } from '../domain/demo-scenario.js';

describe('DemoScenarioRegistry', () => {
  const registry = createDemoScenarioRegistry(ALL_DEMO_SCENARIOS);

  it('registers all 18 scenarios', () => {
    assert.equal(registry.listScenarios().length, 18);
  });

  it('scenario ids are unique', () => {
    const ids = registry.listScenarios().map((scenario) => scenario.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('rejects duplicate scenario ids at construction time', () => {
    const scenario = ALL_DEMO_SCENARIOS[0]!;
    let caught: unknown;
    try {
      createDemoScenarioRegistry([scenario, scenario]);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof DemoScenarioValidationError);
  });

  it('every scenario has a title, summary, enterprise message and buyer pain', () => {
    for (const scenario of registry.listScenarios()) {
      assert.ok(scenario.title.length > 0, `${scenario.id} missing title`);
      assert.ok(scenario.summary.length > 0, `${scenario.id} missing summary`);
      assert.ok(scenario.enterpriseMessage.length > 0, `${scenario.id} missing enterpriseMessage`);
      assert.ok(scenario.buyerPain.length > 0, `${scenario.id} missing buyerPain`);
      assert.ok(scenario.aocValue.length > 0, `${scenario.id} missing aocValue`);
    }
  });

  it('every scenario has steps', () => {
    for (const scenario of registry.listScenarios()) {
      assert.ok(scenario.steps.length > 0, `${scenario.id} has no steps`);
    }
  });

  it('every scenario has expected assertions', () => {
    for (const scenario of registry.listScenarios()) {
      assert.ok(scenario.expectedAssertions.length > 0, `${scenario.id} has no expected assertions`);
    }
  });

  it('can filter by category', () => {
    const approvalScenarios = registry.listByCategory('approval');
    assert.ok(approvalScenarios.length >= 2);
    for (const scenario of approvalScenarios) {
      assert.equal(scenario.category, 'approval');
    }
  });

  it('can filter by tag', () => {
    const blocked = registry.listByTag('blocked');
    assert.ok(blocked.length > 0);
    for (const scenario of blocked) {
      assert.ok(scenario.tags.includes('blocked'));
    }
  });

  it('unknown scenario id returns undefined instead of throwing', () => {
    const result = registry.getScenario('does-not-exist' as DemoScenarioId);
    assert.equal(result, undefined);
  });

  it('rejects a scenario missing steps', () => {
    const invalid: DemoScenario = { ...ALL_DEMO_SCENARIOS[0]!, id: 'internal-agent-allowed', steps: [] };
    let caught: unknown;
    try {
      createDemoScenarioRegistry([invalid]);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof DemoScenarioValidationError);
  });
});
