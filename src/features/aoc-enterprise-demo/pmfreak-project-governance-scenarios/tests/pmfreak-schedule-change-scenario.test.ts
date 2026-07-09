import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios, scheduleChangeApplyReplanScenario, scheduleChangeDetectVarianceScenario } from '../scenarios/index.js';
import { getPMFreakRealAgentPassportFixtures } from '../pmfreak-real-agent-passport-fixtures.js';
import { PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID, PMFREAK_SCENARIO_SCHEDULE_CHANGE_DETECT_VARIANCE_ID } from '../pmfreak-project-governance-scenario-constants.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

const [SCHEDULE_BASELINE_ID, DEPENDENCY_RECORD_ID] = scheduleChangeDetectVarianceScenario.baselineEvidenceIds;

describe('Schedule Change -- Detect Variance', () => {
  it('11. missing schedule baseline requires evidence', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_DETECT_VARIANCE_ID, overrideEvidenceIds: [DEPENDENCY_RECORD_ID!] },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'require_evidence');
    assert.ok(result.missingEvidenceIds.includes(SCHEDULE_BASELINE_ID!));
  });

  it('12. full evidence is authorized by the real runtime guard, capability, and authority scope, and allows', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_DETECT_VARIANCE_ID, overrideEvidenceIds: [SCHEDULE_BASELINE_ID!, DEPENDENCY_RECORD_ID!] },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.passportResolution.allowedByRuntimeGuard, true);
    assert.equal(result.passportResolution.allowedByCapabilityToken, true);
    assert.equal(result.passportResolution.allowedByAuthorityScope, true);
    assert.equal(result.decision, 'allow');
  });
});

describe('Schedule Change -- Apply Replan', () => {
  it('13. is denied because the real Planning role profile explicitly prohibits this action', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID,
        overrideEvidenceIds: [...scheduleChangeApplyReplanScenario.baselineEvidenceIds],
        overrideApprovalIds: [...scheduleChangeApplyReplanScenario.baselineApprovalIds],
      },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'deny');
  });

  it('is denied even with no evidence or approvals at all', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID, overrideEvidenceIds: [], overrideApprovalIds: [] },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'deny');
  });
});
