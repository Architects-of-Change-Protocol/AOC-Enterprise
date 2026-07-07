import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../services/index.js';

describe('DemoExportService', () => {
  it('exports a json_summary artifact', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const artifact = run.exportArtifacts.find((item) => item.type === 'json_summary');
    assert.ok(artifact !== undefined);
    const parsed = JSON.parse(artifact!.content) as { scenarioId: string };
    assert.equal(parsed.scenarioId, 'internal-agent-allowed');
  });

  it('exports a markdown_script artifact', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const artifact = run.exportArtifacts.find((item) => item.type === 'markdown_script');
    assert.ok(artifact !== undefined);
    assert.ok(artifact!.content.startsWith('#'));
  });

  it('exports an operator_walkthrough artifact', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const artifact = run.exportArtifacts.find((item) => item.type === 'operator_walkthrough');
    assert.ok(artifact !== undefined);
    assert.ok(artifact!.content.includes('Operator walkthrough'));
  });

  it('exports a technical_trace artifact', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const artifact = run.exportArtifacts.find((item) => item.type === 'technical_trace');
    assert.ok(artifact !== undefined);
    assert.ok(artifact!.content.includes('enforcementDecisionId='));
  });

  it('exports a sales_one_pager artifact', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const artifact = run.exportArtifacts.find((item) => item.type === 'sales_one_pager');
    assert.ok(artifact !== undefined);
    assert.ok(artifact!.content.includes('Buyer pain'));
  });

  it('every exported artifact includes the scenario id', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    for (const artifact of run.exportArtifacts) {
      assert.equal(artifact.scenarioId, 'internal-agent-allowed');
    }
  });

  it('exported content includes the real outcome status', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-required-block');
    const technicalTrace = run.exportArtifacts.find((item) => item.type === 'technical_trace')!;
    assert.ok(technicalTrace.content.includes(run.outcome!.enforcementDecisionId ?? ''));
  });

  it('exported content includes proof references when available', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const jsonSummary = run.exportArtifacts.find((item) => item.type === 'json_summary')!;
    const parsed = JSON.parse(jsonSummary.content) as { proofChain: { proofIds: string[] } };
    assert.ok(parsed.proofChain.proofIds.length > 0);
  });
});
