import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { changeControlApproveChangeRequestScenario, changeControlRequestEvidenceScenario, demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { getPMFreakRealAgentPassportFixtures } from '../pmfreak-real-agent-passport-fixtures.js';
import { PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID, PMFREAK_SCENARIO_CHANGE_CONTROL_REQUEST_EVIDENCE_ID } from '../pmfreak-project-governance-scenario-constants.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

const [CHANGE_REQUEST_RECORD_ID, SCOPE_STATEMENT_ID] = changeControlRequestEvidenceScenario.baselineEvidenceIds;

describe('Change Control -- Request Supporting Evidence', () => {
  it('21. missing the change-request-record evidence requires evidence', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_REQUEST_EVIDENCE_ID, overrideEvidenceIds: [] },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'require_evidence');
    assert.ok(result.missingEvidenceIds.includes(CHANGE_REQUEST_RECORD_ID!));
  });

  it('requesting evidence with both required evidence signals present allows', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_REQUEST_EVIDENCE_ID, overrideEvidenceIds: [CHANGE_REQUEST_RECORD_ID!, SCOPE_STATEMENT_ID!] },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'allow');
  });

  it('22. documented priority: a contract-sensitive impact requires contract review even while evidence is also missing -- contract review outranks require_evidence in resolvePMFreakAgentPassportAction\'s decision priority', async () => {
    const contractSensitiveScenario = {
      ...changeControlRequestEvidenceScenario,
      context: { ...changeControlRequestEvidenceScenario.context, contractSensitive: true },
    };
    const contractRegistry = createPMFreakProjectGovernanceScenarioRegistry([contractSensitiveScenario]);

    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: contractSensitiveScenario.scenarioId, overrideEvidenceIds: [] }, contractRegistry, runnerDeps);

    assert.equal(result.decision, 'require_contract_review');
    assert.ok(result.missingEvidenceIds.includes(CHANGE_REQUEST_RECORD_ID!), 'missing evidence is still recorded even though the decision escalated past it');
  });
});

describe('Change Control -- Approve Change Request', () => {
  it('23. is always denied -- the real Change Control role profile explicitly prohibits this action', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID,
        overrideEvidenceIds: [...changeControlApproveChangeRequestScenario.baselineEvidenceIds],
        overrideApprovalIds: [...changeControlApproveChangeRequestScenario.baselineApprovalIds],
      },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'deny');
  });
});
