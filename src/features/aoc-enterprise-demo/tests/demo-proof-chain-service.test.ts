import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../services/index.js';
import { createDemoProofChainService } from '../services/demo-proof-chain-service.js';
import { executeInternalAgentAllowedScenario, INTERNAL_AGENT_ALLOWED_SCENARIO } from '../scenarios/internal-agent-allowed.scenario.js';
import { EXPIRED_VISA_BLOCK_SCENARIO } from '../scenarios/expired-visa-block.scenario.js';

describe('DemoProofChainService', () => {
  it('extracts the enforcement proof', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.ok(run.proofChain!.sources.includes('enforcement'));
    assert.ok(run.proofChain!.proofIds.length > 0);
  });

  it('extracts the authority proof when present', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.ok(run.proofChain!.sources.includes('authority'));
  });

  it('extracts the approval proof when present', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-unlocks-execution');
    assert.ok(run.proofChain!.sources.includes('approval'));
  });

  it('extracts the handshake proof when present', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('external-agent-limited-visa');
    assert.ok(run.proofChain!.sources.includes('handshake'));
  });

  it('marks a chain complete when every referenced proof source resolves', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.equal(run.proofChain!.complete, true);
    assert.equal(run.proofChain!.missingSources.length, 0);
  });

  it('marks a chain incomplete when a referenced proof cannot be resolved', async () => {
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const real = await executeInternalAgentAllowedScenario(world, { now: () => '2026-01-01T00:00:00.000Z' });

    const withUnresolvableAuthorityProof = {
      ...real,
      enforcementOutcomes: real.enforcementOutcomes.map((outcome) => ({
        ...outcome,
        decision: { ...outcome.decision, authorityProofId: 'authority-proof-does-not-exist' },
      })),
    };

    const proofChainService = createDemoProofChainService();
    const chain = proofChainService.buildProofChain(INTERNAL_AGENT_ALLOWED_SCENARIO, world, withUnresolvableAuthorityProof);
    assert.equal(chain.complete, false);
    assert.ok(chain.missingSources.includes('authority'));
  });

  it('a scenario that never reaches enforcement produces an empty, incomplete chain', () => {
    const proofChainService = createDemoProofChainService();
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const chain = proofChainService.buildProofChain(EXPIRED_VISA_BLOCK_SCENARIO, world, { outcome: undefined as never, steps: [], enforcementOutcomes: [] });
    assert.equal(chain.complete, false);
    assert.deepEqual(chain.proofIds, []);
  });

  it('produces deterministic proof id ordering for the same run', async () => {
    const suite = createEnterpriseDemoSuite();
    const runA = await suite.runner.runScenario('internal-agent-allowed');
    const runB = await suite.runner.runScenario('internal-agent-allowed');
    assert.deepEqual(runA.proofChain!.proofIds.length, runB.proofChain!.proofIds.length);
    assert.deepEqual(runA.proofChain!.sources, runB.proofChain!.sources);
  });
});
