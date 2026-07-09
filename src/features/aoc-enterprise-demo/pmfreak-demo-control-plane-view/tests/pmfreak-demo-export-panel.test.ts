import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoExportPanel } from '../pmfreak-demo-export-panel.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('createPMFreakDemoExportPanel', () => {
  it('19. shows an audit-ready demo export safely, never a certified-export claim', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, scenarioRegistry, passportRegistry);
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
