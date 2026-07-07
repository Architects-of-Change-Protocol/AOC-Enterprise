import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapDemoScenarioToItem, mapDemoScenarioRunToItem, mapDemoExportArtifactToItem } from '../../integrations/enterprise-demo-export-adapter.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { DemoScenario } from '../../../aoc-enterprise-demo/domain/demo-scenario.js';
import type { DemoScenarioRun } from '../../../aoc-enterprise-demo/domain/demo-step.js';
import type { DemoExportArtifact } from '../../../aoc-enterprise-demo/domain/demo-export.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeScenario(overrides: Partial<DemoScenario> = {}): DemoScenario {
  return {
    id: 'internal-agent-allowed',
    title: 'Internal Agent Allowed',
    shortTitle: 'Allowed',
    category: 'recognition',
    summary: 'An internal agent performs a low-risk read.',
    enterpriseMessage: 'Recognized internal agents can act within their authority.',
    buyerPain: 'Uncontrolled agent access to internal systems.',
    aocValue: 'Every agent action is recognized, authorized, and proven.',
    personas: ['compliance-officer'],
    primaryActorId: 'actor-1',
    trustDomainId: 'trust-domain-1',
    action: 'read_report',
    resourceScope: 'reports:quarterly',
    riskLevel: 'low',
    expectedOutcome: 'executed',
    steps: [],
    expectedAssertions: [],
    tags: ['recognition'],
    ...overrides,
  };
}

function makeRun(overrides: Partial<DemoScenarioRun> = {}): DemoScenarioRun {
  return {
    id: 'demo-run-1',
    scenarioId: 'internal-agent-allowed',
    status: 'passed',
    startedAt: NOW,
    steps: [],
    assertions: [],
    exportArtifacts: [],
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<DemoExportArtifact> = {}): DemoExportArtifact {
  return {
    id: 'demo-export-artifact-1',
    scenarioId: 'internal-agent-allowed',
    type: 'json_summary',
    title: 'Scenario summary',
    content: '{}',
    createdAt: NOW,
    ...overrides,
  };
}

describe('enterprise-demo-export-adapter', () => {
  it('1. mapDemoScenarioToItem maps a DemoScenario to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const scenario = makeScenario();
    const item = mapDemoScenarioToItem(ctx, scenario);

    assert.equal(item.type, 'demo_scenario');
    assert.equal(item.sourceModule, 'aoc_enterprise_demo');
    assert.equal(item.sourceId, scenario.id);
    assert.equal(item.title, scenario.title);
    assert.equal(item.summary, scenario.summary);
  });

  it('2. mapDemoScenarioRunToItem preserves status="passed" and outcome verbatim', () => {
    const ctx = createExportRuntimeContext(NOW);
    const run = makeRun({
      status: 'passed',
      outcome: {
        scenarioId: 'internal-agent-allowed',
        status: 'executed',
        success: true,
        reasonCode: 'EXECUTED',
        reason: 'Scenario executed successfully.',
        executorRan: true,
        sideEffectsExecuted: true,
      },
    });
    const item = mapDemoScenarioRunToItem(ctx, run);

    assert.equal(item.type, 'demo_run');
    assert.equal(item.sourceModule, 'aoc_enterprise_demo');
    assert.equal(item.sourceId, run.id);
    assert.equal(item.payload.status, 'passed');
    assert.deepEqual(item.payload.outcome, run.outcome);
  });

  it('3. mapDemoScenarioRunToItem preserves status="failed" verbatim, demonstrating it does not fake the outcome', () => {
    const ctx = createExportRuntimeContext(NOW);
    const run = makeRun({
      status: 'failed',
      outcome: {
        scenarioId: 'internal-agent-allowed',
        status: 'blocked',
        success: false,
        reasonCode: 'ASSERTION_FAILED',
        reason: 'An expected assertion did not hold.',
        executorRan: false,
        sideEffectsExecuted: false,
      },
    });
    const item = mapDemoScenarioRunToItem(ctx, run);

    assert.equal(item.payload.status, 'failed');
    assert.notEqual(item.payload.status, 'passed');
    assert.equal((item.payload.outcome as { success: boolean }).success, false);
  });

  it('4. mapDemoExportArtifactToItem maps a DemoExportArtifact to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const artifact = makeArtifact();
    const item = mapDemoExportArtifactToItem(ctx, artifact);

    assert.equal(item.type, 'demo_export_artifact');
    assert.equal(item.sourceModule, 'aoc_enterprise_demo');
    assert.equal(item.sourceId, artifact.id);
    assert.equal(item.title, artifact.title);
    assert.equal(item.payload.content, artifact.content);
  });
});
