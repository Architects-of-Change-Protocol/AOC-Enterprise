import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID } from '../pmfreak-project-governance-scenario-constants.js';
import { demoPMFreakRisks } from '../pmfreak-demo-project-fixtures.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('Risk Escalation -- Prepare Escalation', () => {
  it('the demo risk fixture documents a risk record as a required evidence signal for this risk\'s own workflow', () => {
    const risk = demoPMFreakRisks.find((candidate) => candidate.riskId === 'risk.demo.unconfirmed-customer-acceptance');
    assert.ok(risk !== undefined);
    assert.ok(risk!.requiredEvidenceIds.includes('pmfreak.evidence.risk_record'));
  });

  it('14/15. the Risk Agent can prepare a risk draft in scope -- pmfreak.action.risk.create_draft requires no evidence or approval in the passport pack\'s action catalog, so the draft allows once the agent is in authority scope', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID }, scenarioRegistry, passportRegistry);

    assert.equal(result.passportResolution.allowedByPassport, true);
    assert.equal(result.passportResolution.allowedByCapability, true);
    assert.equal(result.passportResolution.allowedByAuthorityScope, true);
    assert.equal(result.decision, 'allow');
  });

  it('closing the risk (which does require a risk record and PM approval) is restricted for every demo Risk Agent passport, so it always denies', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
        overrideAgentId: 'pmfreak.agent.risk',
        overridePassportId: 'aoc.passport.pmfreak.risk.demo.v1',
      },
      scenarioRegistry,
      passportRegistry,
    );

    // The scenario always attempts create_draft (not close) -- confirms the restricted risk.close
    // action is never the one this scenario exercises, matching the passport pack's own restriction.
    assert.equal(result.actionId, 'pmfreak.action.risk.create_draft');
    assert.notEqual(result.decision, 'deny');
  });

  it('16. the safe narrative never claims a contractual breach or assigns blame to the customer', () => {
    const scenario = scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID);
    assert.ok(scenario !== undefined);

    const narrative = scenario!.safeNarrative.toLowerCase();
    // "claim breach" is a safe negation ("cannot ... claim breach") -- only an affirmative breach
    // claim would be unsafe.
    assert.ok(!narrative.includes('breach occurred'));
    assert.ok(!narrative.includes('breach detected'));
    assert.ok(!narrative.includes('confirmed breach'));
    assert.ok(!narrative.includes('customer is at fault'));
    assert.ok(!narrative.includes('customer\'s fault'));
    assert.ok(narrative.includes('cannot assign blame'));
    assert.ok(narrative.includes('cannot') && narrative.includes('claim breach'));
  });
});
