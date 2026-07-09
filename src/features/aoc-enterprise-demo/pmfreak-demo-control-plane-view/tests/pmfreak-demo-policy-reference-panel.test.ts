import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID,
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  getPMFreakRealAgentPassportFixtures,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakScenarioRunnerDeps } from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoPolicyReferencePanel } from '../pmfreak-demo-policy-reference-panel.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

describe('createPMFreakDemoPolicyReferencePanel', () => {
  /**
   * Changed under the real model: `appliedPolicyPackIds` is now computed entirely by the scenario
   * runner from this scenario pack's own id plus the scenario's project-context policy pack ids --
   * `@aoc-enterprise/pmfreak-agent-passport-foundation` is a workspace code dependency, not a
   * `PolicyPackManifest`-shaped pack, so there is no separate "agent passport" policy pack id to
   * preserve here anymore.
   */
  it('17. preserves the applied project-governance-scenario policy pack id', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);
    const panel = createPMFreakDemoPolicyReferencePanel(result);

    assert.ok(panel.appliedPolicyPackIds.includes(PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID));
  });

  it('18. preserves the Costa Rica jurisdiction context reference safely, never as a compliance claim', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);
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
