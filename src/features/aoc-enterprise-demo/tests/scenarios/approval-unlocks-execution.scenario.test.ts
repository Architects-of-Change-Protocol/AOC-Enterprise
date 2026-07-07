import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('approval-unlocks-execution scenario', () => {
  it('approval proof exists', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-unlocks-execution');
    assert.ok(run.outcome!.approvalProofId !== undefined);
  });

  it('outcome.status is executed and executorRan after approval', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-unlocks-execution');
    assert.equal(run.status, 'passed');
    assert.equal(run.outcome!.status, 'executed');
    assert.equal(run.outcome!.executorRan, true);
  });

  it('proof chain includes approval and enforcement', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-unlocks-execution');
    assert.ok(run.proofChain!.sources.includes('approval'));
    assert.ok(run.proofChain!.sources.includes('enforcement'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-unlocks-execution');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });

  it('exported artifacts exist', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-unlocks-execution');
    assert.equal(run.exportArtifacts.length, 5);
  });
});
