import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoTraceTimeline } from '../pmfreak-demo-trace-timeline.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

const EXPECTED_LABELS = [
  'Scenario loaded',
  'Passport resolved',
  'Action authorized',
  'Capability checked',
  'Authority scope checked',
  'Evidence checked',
  'Approvals checked',
  'Context sensitivity checked',
  'Decision computed',
  'Control Plane ready',
  'Export metadata ready',
];

describe('createPMFreakDemoTraceTimeline', () => {
  it('15. preserves the scenario trace order with the canonical step labels', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, scenarioRegistry, passportRegistry);
    const timeline = createPMFreakDemoTraceTimeline(result);

    assert.deepEqual(
      timeline.steps.map((s) => s.label),
      EXPECTED_LABELS,
    );
    assert.deepEqual(
      timeline.steps.map((s) => s.order),
      EXPECTED_LABELS.map((_, i) => i + 1),
    );
  });

  it('16. uses safe language -- no legal breach, invoice, customer-acceptance-certification, or compliance claims', () => {
    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID, overrideEvidenceIds: [], overrideApprovalIds: [] },
      scenarioRegistry,
      passportRegistry,
    );
    const timeline = createPMFreakDemoTraceTimeline(result);
    const text = JSON.stringify(timeline).toLowerCase();

    assert.ok(!text.includes('legal breach'));
    assert.ok(!text.includes('invoice is invalid'));
    assert.ok(!text.includes('customer acceptance certified'));
    assert.ok(!text.includes('compliance passed'));
  });
});
