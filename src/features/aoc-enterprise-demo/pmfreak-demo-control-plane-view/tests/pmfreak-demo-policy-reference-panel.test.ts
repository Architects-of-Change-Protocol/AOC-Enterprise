import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoPolicyReferencePanel } from '../pmfreak-demo-policy-reference-panel.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('createPMFreakDemoPolicyReferencePanel', () => {
  it('17. preserves the applied policy pack ids from both underlying packs', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, scenarioRegistry, passportRegistry);
    const panel = createPMFreakDemoPolicyReferencePanel(result);

    assert.ok(panel.appliedPolicyPackIds.includes('aoc.demo.pmfreak.agent_passport.v1'));
    assert.ok(panel.appliedPolicyPackIds.includes('aoc.demo.pmfreak.project_governance_scenarios.v1'));
  });

  it('18. preserves the Costa Rica jurisdiction context reference safely, never as a compliance claim', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, scenarioRegistry, passportRegistry);
    const panel = createPMFreakDemoPolicyReferencePanel(result);

    assert.ok(panel.jurisdictionPackIds.includes('aoc.jurisdiction.costa_rica.base.v1'));
    assert.equal(panel.jurisdictionContextLabel, 'Costa Rica jurisdiction context referenced');

    const finding = panel.findings.find((f) => f.id === 'jurisdiction_costa_rica');
    assert.ok(finding !== undefined);
    assert.equal(finding!.label, 'Costa Rica jurisdiction context referenced');

    const text = JSON.stringify(panel).toLowerCase();
    assert.ok(!text.includes('costa rica compliant'));
    assert.ok(!text.includes('cr compliant'));
  });
});
