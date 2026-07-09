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
import { createPMFreakDemoTraceTimeline } from '../pmfreak-demo-trace-timeline.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

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
  it('15. preserves the scenario trace order with the canonical step labels', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);
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

  it('16. uses safe language -- no legal breach, invoice, customer-acceptance-certification, or compliance claims', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID, overrideEvidenceIds: [], overrideApprovalIds: [] },
      scenarioRegistry,
      runnerDeps,
    );
    const timeline = createPMFreakDemoTraceTimeline(result);
    const text = JSON.stringify(timeline).toLowerCase();

    assert.ok(!text.includes('legal breach'));
    assert.ok(!text.includes('invoice is invalid'));
    assert.ok(!text.includes('customer acceptance certified'));
    assert.ok(!text.includes('compliance passed'));
  });
});
