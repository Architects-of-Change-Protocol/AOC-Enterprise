import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios, milestoneAcceptanceValidateAcceptanceScenario } from '../scenarios/index.js';
import { getPMFreakRealAgentPassportFixtures } from '../pmfreak-real-agent-passport-fixtures.js';
import { PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID } from '../pmfreak-project-governance-scenario-constants.js';
import { createPMFreakProjectGovernanceScenarioControlPlaneSummary } from '../pmfreak-scenario-control-plane-summary.js';
import { createPMFreakProjectGovernanceScenarioExportMetadata } from '../pmfreak-scenario-export-metadata.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

const [DELIVERABLE_EVIDENCE_ID] = milestoneAcceptanceValidateAcceptanceScenario.baselineEvidenceIds;

describe('Milestone Acceptance -- Validate Acceptance Signals', () => {
  it('9. missing deliverable evidence requires evidence (the actual passport-pack-enforced gate for this action)', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID, overrideEvidenceIds: [] },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'require_evidence');
    assert.ok(result.missingEvidenceIds.includes(DELIVERABLE_EVIDENCE_ID!));
  });

  it('the Evidence Agent can classify collected evidence once deliverable evidence is present', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID, overrideEvidenceIds: [DELIVERABLE_EVIDENCE_ID!] },
      scenarioRegistry,
      runnerDeps,
    );

    assert.equal(result.decision, 'allow');
  });

  it('10. neither the Control Plane summary nor export metadata claim customer acceptance certification', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID, overrideEvidenceIds: [DELIVERABLE_EVIDENCE_ID!] },
      scenarioRegistry,
      runnerDeps,
    );

    const scenario = scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID);
    assert.ok(scenario !== undefined);

    const summary = createPMFreakProjectGovernanceScenarioControlPlaneSummary(result);
    const metadata = createPMFreakProjectGovernanceScenarioExportMetadata(result, scenario!.projectContext);

    const summaryText = JSON.stringify(summary).toLowerCase();
    const metadataText = JSON.stringify(metadata).toLowerCase();
    assert.ok(!summaryText.includes('customer acceptance certified'));
    assert.ok(!metadataText.includes('customer acceptance certified'));
  });
});
