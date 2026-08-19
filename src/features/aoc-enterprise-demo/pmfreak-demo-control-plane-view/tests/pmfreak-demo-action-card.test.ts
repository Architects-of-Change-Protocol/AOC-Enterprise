import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  getPMFreakRealAgentPassportFixtures,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakScenarioRunnerDeps } from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoAttemptedActionCard } from '../pmfreak-demo-action-card.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

describe('createPMFreakDemoAttemptedActionCard', () => {
  it('11. includes context flags applicable to the billing readiness scenario', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);
    const card = createPMFreakDemoAttemptedActionCard(result);

    assert.ok(card.contextFlags.includes('billing_sensitive'));
    assert.ok(card.contextFlags.includes('project_closure_sensitive'));
    assert.ok(!card.contextFlags.includes('legal_sensitive'));
  });

  it('includes context flags applicable to the milestone acceptance scenario', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID }, scenarioRegistry, runnerDeps);
    const card = createPMFreakDemoAttemptedActionCard(result);

    assert.ok(card.contextFlags.includes('project_closure_sensitive'));
    assert.ok(!card.contextFlags.includes('customer_facing'));
  });

  it('carries a fixed, claim-safe description regardless of scenario', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);
    const card = createPMFreakDemoAttemptedActionCard(result);

    assert.ok(card.safeDescription.includes('Soberanía evaluated passport, capability, scope, evidence and approvals'));
    assert.equal(card.actionAttemptId, result.actionAttemptId);
    assert.equal(card.scenarioCategory, result.category);
  });
});
