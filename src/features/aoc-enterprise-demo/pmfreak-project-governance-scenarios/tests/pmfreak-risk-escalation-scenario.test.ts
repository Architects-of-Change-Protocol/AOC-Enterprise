import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { getPMFreakRealAgentPassportFixtures } from '../pmfreak-real-agent-passport-fixtures.js';
import { PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID } from '../pmfreak-project-governance-scenario-constants.js';
import { demoPMFreakRisks } from '../pmfreak-demo-project-fixtures.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

describe('Risk Escalation -- Prepare Escalation', () => {
  it("the demo risk fixture documents a risk record as a required evidence signal for this risk's own workflow", () => {
    const risk = demoPMFreakRisks.find((candidate) => candidate.riskId === 'risk.demo.unconfirmed-customer-acceptance');
    assert.ok(risk !== undefined);
    assert.ok(risk!.requiredEvidenceIds.includes('pmfreak.evidence.risk_record'));
  });

  it('14/15. the Risk Agent can detect risk in scope -- pmfreak.foundation.action.risk.detect requires no approval in the real role profile, so detection allows once evidence is present and the agent is in authority scope', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID }, scenarioRegistry, runnerDeps);

    assert.equal(result.passportResolution.allowedByRuntimeGuard, true);
    assert.equal(result.passportResolution.allowedByCapabilityToken, true);
    assert.equal(result.passportResolution.allowedByAuthorityScope, true);
    assert.equal(result.decision, 'allow');
  });

  /**
   * Replaces the old demo pack's "closing the risk is restricted for every demo Risk Agent
   * passport" test -- that test exercised a `risk.close` action attempt via a hand-authored
   * passport-id override, a mechanism the real resolver has no equivalent for (passports are now
   * looked up by role, never by a spoofable passport id, and this scenario pack does not declare a
   * `risk.close` scenario). Under the real role profile, `risk.close` is explicitly prohibited and
   * `risk.draft_mitigation` requires human approval (see the real
   * `PMFREAK_AGENT_ROLE_PROFILES` risk entry) -- this scenario always attempts detection only,
   * confirming those two out-of-scope actions are never the one this scenario exercises.
   */
  it('drafting mitigation and closing the risk remain out of scope for this scenario -- it always attempts detection only, and detection is never denied', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID }, scenarioRegistry, runnerDeps);

    assert.equal(result.actionId, 'pmfreak.foundation.action.risk.detect');
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
    assert.ok(!narrative.includes("customer's fault"));
    assert.ok(narrative.includes('cannot') && narrative.includes('claim breach'));
  });
});
