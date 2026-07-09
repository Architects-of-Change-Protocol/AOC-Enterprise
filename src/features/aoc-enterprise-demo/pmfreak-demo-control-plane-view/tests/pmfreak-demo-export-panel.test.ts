import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  getPMFreakRealAgentPassportFixtures,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakScenarioRunnerDeps } from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoExportPanel } from '../pmfreak-demo-export-panel.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

describe('createPMFreakDemoExportPanel', () => {
  it('19. shows an audit-ready demo export safely, never a certified-export claim', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);
    const panel = createPMFreakDemoExportPanel(result);

    assert.equal(panel.exportReady, true);
    assert.equal(panel.traceIncluded, true);
    assert.equal(panel.safeFramingIncluded, true);
    assert.equal(panel.exportLabel, 'Audit-ready demo export');

    const text = JSON.stringify(panel).toLowerCase();
    assert.ok(!text.includes('certified audit export'));
    assert.ok(!text.includes('compliance export'));
    assert.ok(!text.includes('legal evidence package'));
  });
});
