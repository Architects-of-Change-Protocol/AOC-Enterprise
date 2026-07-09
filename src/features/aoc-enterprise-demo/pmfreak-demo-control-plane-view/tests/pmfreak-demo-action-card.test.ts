import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
  PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoAttemptedActionCard } from '../pmfreak-demo-action-card.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('createPMFreakDemoAttemptedActionCard', () => {
  it('11. includes context flags applicable to the billing readiness scenario', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, scenarioRegistry, passportRegistry);
    const card = createPMFreakDemoAttemptedActionCard(result);

    assert.ok(card.contextFlags.includes('billing_sensitive'));
    assert.ok(card.contextFlags.includes('project_closure_sensitive'));
    assert.ok(!card.contextFlags.includes('legal_sensitive'));
  });

  it('includes context flags applicable to the milestone acceptance scenario', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID }, scenarioRegistry, passportRegistry);
    const card = createPMFreakDemoAttemptedActionCard(result);

    assert.ok(card.contextFlags.includes('project_closure_sensitive'));
    assert.ok(!card.contextFlags.includes('customer_facing'));
  });

  it('carries a fixed, claim-safe description regardless of scenario', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID }, scenarioRegistry, passportRegistry);
    const card = createPMFreakDemoAttemptedActionCard(result);

    assert.ok(card.safeDescription.includes('AOC evaluated passport, capability, scope, evidence and approvals'));
    assert.equal(card.actionAttemptId, result.actionAttemptId);
    assert.equal(card.scenarioCategory, result.category);
  });
});
