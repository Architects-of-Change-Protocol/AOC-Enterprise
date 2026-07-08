import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID, PMFREAK_SCENARIO_SCHEDULE_CHANGE_PROPOSE_REPLAN_ID } from '../pmfreak-project-governance-scenario-constants.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('Schedule Change -- Propose Replan', () => {
  it('11. missing schedule baseline requires evidence', () => {
    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_PROPOSE_REPLAN_ID, overrideEvidenceIds: ['pmfreak.evidence.dependency_record'] },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'require_evidence');
    assert.ok(result.missingEvidenceIds.includes('pmfreak.evidence.schedule_baseline'));
  });

  it('12. full evidence is authorized by passport, capability, and authority scope, and allows', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_PROPOSE_REPLAN_ID,
        overrideEvidenceIds: ['pmfreak.evidence.schedule_baseline', 'pmfreak.evidence.dependency_record'],
      },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.passportResolution.allowedByPassport, true);
    assert.equal(result.passportResolution.allowedByCapability, true);
    assert.equal(result.passportResolution.allowedByAuthorityScope, true);
    assert.equal(result.decision, 'allow');
  });
});

describe('Schedule Change -- Apply Replan', () => {
  it('13. is denied because the demo Planning Agent passport explicitly restricts this action', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID,
        overrideEvidenceIds: ['pmfreak.evidence.schedule_baseline'],
        overrideApprovalIds: ['pmfreak.approval.pm_approval'],
      },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'deny');
  });

  it('is denied even with no evidence or approvals at all', () => {
    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID, overrideEvidenceIds: [], overrideApprovalIds: [] },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'deny');
  });
});
