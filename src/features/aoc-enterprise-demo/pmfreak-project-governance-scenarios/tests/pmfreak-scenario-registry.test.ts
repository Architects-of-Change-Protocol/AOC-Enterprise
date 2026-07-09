import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID,
  PMFREAK_SCENARIO_CHANGE_CONTROL_REQUEST_EVIDENCE_ID,
  PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID,
  PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID,
  PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID,
  PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
  PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID,
  PMFREAK_SCENARIO_SCHEDULE_CHANGE_DETECT_VARIANCE_ID,
} from '../pmfreak-project-governance-scenario-constants.js';

const ALL_SCENARIO_IDS = [
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID,
  PMFREAK_SCENARIO_SCHEDULE_CHANGE_DETECT_VARIANCE_ID,
  PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID,
  PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
  PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID,
  PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID,
  PMFREAK_SCENARIO_CHANGE_CONTROL_REQUEST_EVIDENCE_ID,
  PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID,
];

describe('PMFreak Project Governance Scenario registry', () => {
  it('3. lists every required scenario id, supports findByScenarioId and findByCategory', () => {
    const registry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);

    for (const scenarioId of ALL_SCENARIO_IDS) {
      assert.ok(registry.listScenarioIds().includes(scenarioId), `expected registry to list "${scenarioId}"`);
      assert.ok(registry.findByScenarioId(scenarioId) !== undefined, `expected findByScenarioId to resolve "${scenarioId}"`);
    }

    assert.equal(registry.findByScenarioId('pmfreak.scenario.does_not_exist'), undefined);

    const billingScenarios = registry.findByCategory('billing_readiness');
    assert.equal(billingScenarios.length, 1);
    assert.equal(billingScenarios[0]?.scenarioId, PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID);

    const scheduleScenarios = registry.findByCategory('schedule_change');
    assert.equal(scheduleScenarios.length, 2);

    const clientCommunicationScenarios = registry.findByCategory('client_communication');
    assert.equal(clientCommunicationScenarios.length, 2);

    const changeControlScenarios = registry.findByCategory('change_control');
    assert.equal(changeControlScenarios.length, 2);
  });

  it('4. is deterministic: stable listScenarioIds order and no mutation of the input array', () => {
    const inputScenarios = [...demoPMFreakProjectGovernanceScenarios];
    const registry = createPMFreakProjectGovernanceScenarioRegistry(inputScenarios);

    assert.deepEqual(registry.listScenarioIds(), createPMFreakProjectGovernanceScenarioRegistry(inputScenarios).listScenarioIds());
    assert.deepEqual(
      registry.listScenarioIds(),
      inputScenarios.map((scenario) => scenario.scenarioId),
    );

    const beforeLength = inputScenarios.length;
    registry.findByScenarioId(PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID);
    registry.findByCategory('billing_readiness');
    assert.equal(inputScenarios.length, beforeLength);
    assert.deepEqual(
      inputScenarios.map((scenario) => scenario.scenarioId),
      ALL_SCENARIO_IDS,
    );
  });
});
