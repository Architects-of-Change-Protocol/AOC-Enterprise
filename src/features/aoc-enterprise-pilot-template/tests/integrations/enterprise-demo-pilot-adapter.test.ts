import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEnterpriseDemoSuite } from '../../../aoc-enterprise-demo/services/index.js';
import {
  lookupDemoScenario,
  summarizeDemoScenario,
  extractDemoRunProofReferences,
  pilotOutcomeMatchesDemoStatus,
  runBoundDemoScenario,
} from '../../integrations/enterprise-demo-pilot-adapter.js';

describe('enterprise-demo-pilot-adapter', () => {
  it('1. maps Enterprise Demo scenario', () => {
    const demoSuite = createEnterpriseDemoSuite();
    const scenario = lookupDemoScenario(demoSuite.registry, 'internal-agent-allowed');
    if (scenario === undefined) {
      throw new Error('Expected to find internal-agent-allowed scenario.');
    }
    const summary = summarizeDemoScenario(scenario);
    assert.equal(summary.demoScenarioId, 'internal-agent-allowed');
  });

  it('2. preserves scenario ID', () => {
    const demoSuite = createEnterpriseDemoSuite();
    const scenario = lookupDemoScenario(demoSuite.registry, 'approval-required-block');
    assert.equal(scenario?.id, 'approval-required-block');
  });

  it('3. preserves expected outcome', () => {
    const demoSuite = createEnterpriseDemoSuite();
    const scenario = lookupDemoScenario(demoSuite.registry, 'approval-required-block');
    if (scenario === undefined) {
      throw new Error('Expected scenario.');
    }
    const summary = summarizeDemoScenario(scenario);
    assert.equal(summary.expectedOutcome, scenario.expectedOutcome);
  });

  it('4. exposes proof references when available', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const run = await runBoundDemoScenario(demoSuite.runner, 'internal-agent-allowed');
    const refs = extractDemoRunProofReferences(run);
    assert.ok(refs.recognitionDecisionId !== undefined || refs.enforcementDecisionId !== undefined);
  });

  it('5. does not fake outcome', async () => {
    const demoSuite = createEnterpriseDemoSuite();
    const run = await runBoundDemoScenario(demoSuite.runner, 'approval-required-block');
    assert.equal(pilotOutcomeMatchesDemoStatus('approval_required', run.outcome?.status ?? 'unknown'), true);
    assert.equal(pilotOutcomeMatchesDemoStatus('executed', run.outcome?.status ?? 'unknown'), false);
  });
});
