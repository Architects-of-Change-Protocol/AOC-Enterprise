import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../services/index.js';
import { createDemoNarrativeService } from '../services/demo-narrative-service.js';

describe('DemoNarrativeService', () => {
  it('creates buyer pain, Soberanía value, what-happened, why-it-matters, proof explanation and suggested narration', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const narrative = createDemoNarrativeService().buildNarrative(scenario, run.outcome!, run.proofChain);

    const kinds = narrative.messages.map((message) => message.kind);
    assert.ok(kinds.includes('buyer_pain'));
    assert.ok(kinds.includes('aoc_value'));
    assert.ok(kinds.includes('what_happened'));
    assert.ok(kinds.includes('why_it_matters'));
    assert.ok(kinds.includes('proof_explanation'));
    assert.ok(kinds.includes('suggested_narration'));
  });

  it('buyer pain message matches the scenario definition', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const narrative = createDemoNarrativeService().buildNarrative(scenario, run.outcome!, run.proofChain);
    const buyerPain = narrative.messages.find((message) => message.kind === 'buyer_pain');
    assert.equal(buyerPain?.body, scenario.buyerPain);
  });

  it('proof explanation reflects the real proof chain completeness', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const narrative = createDemoNarrativeService().buildNarrative(scenario, run.outcome!, run.proofChain);
    const proofExplanation = narrative.messages.find((message) => message.kind === 'proof_explanation');
    assert.ok(proofExplanation !== undefined);
    assert.equal(proofExplanation!.body.includes('complete'), run.proofChain!.complete);
  });

  it('is deterministic for the same scenario, outcome and proof chain', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    const narrativeService = createDemoNarrativeService();
    const first = narrativeService.buildNarrative(scenario, run.outcome!, run.proofChain);
    const second = narrativeService.buildNarrative(scenario, run.outcome!, run.proofChain);
    assert.deepEqual(first, second);
  });
});
