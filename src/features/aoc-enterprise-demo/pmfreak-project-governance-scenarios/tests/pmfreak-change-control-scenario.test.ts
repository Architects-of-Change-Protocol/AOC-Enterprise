import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { changeControlClassifyChangeRequestScenario, demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID, PMFREAK_SCENARIO_CHANGE_CONTROL_CLASSIFY_CHANGE_REQUEST_ID } from '../pmfreak-project-governance-scenario-constants.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('Change Control -- Classify Change Request', () => {
  it('21. missing the change-request-record evidence requires evidence', () => {
    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_CLASSIFY_CHANGE_REQUEST_ID, overrideEvidenceIds: [] },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'require_evidence');
    assert.ok(result.missingEvidenceIds.includes('pmfreak.evidence.change_request_record'));
  });

  it('classifying with the change-request-record evidence present allows', () => {
    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_CLASSIFY_CHANGE_REQUEST_ID, overrideEvidenceIds: ['pmfreak.evidence.change_request_record'] },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'allow');
  });

  it('22. documented priority: a contract-sensitive impact requires contract review even while evidence is also missing -- contract review outranks require_evidence in resolvePMFreakAgentPassportAction\'s decision priority', () => {
    const contractSensitiveScenario = {
      ...changeControlClassifyChangeRequestScenario,
      context: { ...changeControlClassifyChangeRequestScenario.context, contractSensitive: true },
    };
    const contractRegistry = createPMFreakProjectGovernanceScenarioRegistry([contractSensitiveScenario]);

    const result = runPMFreakProjectGovernanceScenario({ scenarioId: contractSensitiveScenario.scenarioId, overrideEvidenceIds: [] }, contractRegistry, passportRegistry);

    assert.equal(result.decision, 'require_contract_review');
    assert.ok(result.missingEvidenceIds.includes('pmfreak.evidence.change_request_record'), 'missing evidence is still recorded even though the decision escalated past it');
  });
});

describe('Change Control -- Approve Change Request', () => {
  it('23. is always denied -- the demo Change Control Agent passport explicitly restricts this action', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID,
        overrideEvidenceIds: ['pmfreak.evidence.change_request_record'],
        overrideApprovalIds: ['pmfreak.approval.pm_approval'],
      },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'deny');
  });
});
