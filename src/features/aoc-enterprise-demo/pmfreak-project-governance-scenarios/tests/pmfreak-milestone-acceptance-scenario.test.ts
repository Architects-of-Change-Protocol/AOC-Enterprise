import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID } from '../pmfreak-project-governance-scenario-constants.js';
import { createPMFreakProjectGovernanceScenarioControlPlaneSummary } from '../pmfreak-scenario-control-plane-summary.js';
import { createPMFreakProjectGovernanceScenarioExportMetadata } from '../pmfreak-scenario-export-metadata.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('Milestone Acceptance -- Validate Acceptance Signals', () => {
  it('9. missing deliverable evidence requires evidence (the actual passport-pack-enforced gate for this action)', () => {
    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID, overrideEvidenceIds: [] },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'require_evidence');
    assert.ok(result.missingEvidenceIds.includes('pmfreak.evidence.deliverable_evidence'));
  });

  it('the Evidence Agent can prepare a bundle once deliverable evidence is present', () => {
    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID, overrideEvidenceIds: ['pmfreak.evidence.deliverable_evidence'] },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.decision, 'allow');
  });

  it('10. neither the Control Plane summary nor export metadata claim customer acceptance certification', () => {
    const result = runPMFreakProjectGovernanceScenario(
      { scenarioId: PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID, overrideEvidenceIds: ['pmfreak.evidence.deliverable_evidence'] },
      scenarioRegistry,
      passportRegistry,
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
