import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../services/index.js';
import { DemoAssertionService } from '../services/demo-assertion-service.js';
import { DemoScenarioRunner } from '../services/demo-scenario-runner.js';
import { DemoStepRunner } from '../services/demo-step-runner.js';
import { SCENARIO_ASSERTION_EVALUATORS } from '../scenarios/index.js';

describe('DemoScenarioRunner', () => {
  it('can run a scenario by id and returns a DemoScenarioRun', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.equal(run.scenarioId, 'internal-agent-allowed');
    assert.ok(run.id.startsWith('scenario-run-internal-agent-allowed-'));
    assert.ok(run.outcome !== undefined);
    assert.ok(run.controlPlaneSnapshot !== undefined);
    assert.ok(run.proofChain !== undefined);
    assert.ok(run.exportArtifacts.length === 5);
  });

  it('records startedAt/completedAt using an injected, deterministic clock', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.equal(run.startedAt, '2026-01-01T00:00:00.000Z');
    assert.ok(run.completedAt !== undefined && run.completedAt > run.startedAt);
  });

  it('produces steps in the same order as the scenario definition', async () => {
    const suite = createEnterpriseDemoSuite();
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.deepEqual(
      run.steps.map((step) => step.stepId),
      scenario.steps.map((step) => step.id),
    );
  });

  it('marks the run passed when every assertion passes', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.equal(run.status, 'passed');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });

  it('marks the run failed when an assertion fails', async () => {
    const suite = createEnterpriseDemoSuite();
    const failingAssertionService = new DemoAssertionService({
      ...SCENARIO_ASSERTION_EVALUATORS,
      'internal-agent-allowed': (scenario, result) => [
        {
          id: 'assertion-result-forced-failure',
          scenarioId: scenario.id,
          assertionId: 'forced-failure',
          type: 'executor_safety',
          passed: false,
          expected: 'forced failure for test coverage',
          actual: String(result.outcome.executorRan),
          reasonCode: 'FORCED_TEST_FAILURE',
          reason: 'Deliberately failed for demo-scenario-runner.test.ts coverage.',
        },
      ],
    });
    const runner = new DemoScenarioRunner({
      registry: suite.registry,
      orchestrator: suite.orchestrator,
      stepRunner: new DemoStepRunner(),
      assertionService: failingAssertionService,
      proofChainService: suite.proofChainService,
      controlPlaneSnapshotService: suite.controlPlaneSnapshotService,
      exportService: suite.exportService,
    });

    const run = await runner.runScenario('internal-agent-allowed');
    assert.equal(run.status, 'failed');
    assert.equal(run.assertions.length, 1);
    assert.equal(run.assertions[0]!.passed, false);
  });

  it('attaches every required artifact to the run', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-unlocks-execution');
    const artifactTypes = run.exportArtifacts.map((artifact) => artifact.type).sort();
    assert.deepEqual(artifactTypes, ['json_summary', 'markdown_script', 'operator_walkthrough', 'sales_one_pager', 'technical_trace'].sort());
  });
});
