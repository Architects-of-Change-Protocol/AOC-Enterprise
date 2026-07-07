import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../../services/index.js';

describe('external-agent-limited-visa scenario', () => {
  it('the handshake step reports an active visa and ingress grant', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('external-agent-limited-visa');
    assert.equal(run.status, 'passed');
    const handshakeStep = run.steps.find((step) => step.kind === 'external_handshake');
    assert.ok(handshakeStep !== undefined);
    assert.equal(handshakeStep!.status, 'passed');
  });

  it('outcome.status is executed', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('external-agent-limited-visa');
    assert.equal(run.outcome!.status, 'executed');
    assert.equal(run.outcome!.executorRan, true);
  });

  it('proof chain includes handshake and enforcement', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('external-agent-limited-visa');
    assert.ok(run.proofChain!.sources.includes('handshake'));
    assert.ok(run.proofChain!.sources.includes('enforcement'));
  });

  it('all assertions pass', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('external-agent-limited-visa');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });
});
