import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../services/index.js';
import { createDemoScriptService } from '../services/demo-script-service.js';

describe('DemoScriptService', () => {
  it('creates an executive script', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const scriptService = createDemoScriptService();
    const script = scriptService.buildScript(scenario, run.outcome!, 'executive');
    assert.equal(script.audience, 'executive');
    assert.ok(script.title.length > 0);
  });

  it('creates a technical script', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const script = createDemoScriptService().buildScript(scenario, run.outcome!, 'technical');
    assert.equal(script.audience, 'technical');
  });

  it('creates an operator script', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const script = createDemoScriptService().buildScript(scenario, run.outcome!, 'operator');
    assert.equal(script.audience, 'operator');
  });

  it('creates an investor script', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const script = createDemoScriptService().buildScript(scenario, run.outcome!, 'investor');
    assert.equal(script.audience, 'investor');
  });

  it('script references the scenario title', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const script = createDemoScriptService().buildScript(scenario, run.outcome!, 'executive');
    assert.equal(script.title, scenario.title);
  });

  it('does not claim an outcome the run did not produce', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-required-block');
    const scenario = suite.registry.getScenario('approval-required-block')!;
    const script = createDemoScriptService().buildScript(scenario, run.outcome!, 'executive');
    assert.ok(script.closing.includes(run.outcome!.status));
    assert.ok(!script.closing.includes('executed'));
  });

  it('is deterministic for the same scenario and outcome', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const scriptService = createDemoScriptService();
    const first = scriptService.buildScript(scenario, run.outcome!, 'executive');
    const second = scriptService.buildScript(scenario, run.outcome!, 'executive');
    assert.deepEqual(first, second);
  });

  it('builds all four audience scripts', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const scripts = createDemoScriptService().buildAllAudienceScripts(scenario, run.outcome!);
    assert.equal(scripts.length, 4);
  });
});
