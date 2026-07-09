import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import {
  PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoAuthorityScopePanel } from '../pmfreak-demo-authority-panel.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

describe('createPMFreakDemoAuthorityScopePanel', () => {
  it('shows an in-scope attempt as satisfied', () => {
    const result = runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID }, scenarioRegistry, passportRegistry);
    const panel = createPMFreakDemoAuthorityScopePanel(result);

    assert.equal(panel.allowedByAuthorityScope, true);
    assert.equal(panel.status, 'satisfied');
  });

  it('12. shows a failed scope safely for an out-of-scope demo passport, with no production authorization claim', () => {
    const result = runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
        overridePassportId: 'aoc.passport.pmfreak.risk.out_of_scope.v1',
        overrideAgentId: 'pmfreak.agent.risk.out_of_scope',
      },
      scenarioRegistry,
      passportRegistry,
    );

    assert.equal(result.passportResolution.allowedByAuthorityScope, false);

    const panel = createPMFreakDemoAuthorityScopePanel(result);

    assert.equal(panel.allowedByAuthorityScope, false);
    assert.equal(panel.status, 'failed');
    assert.equal(panel.findings.length, 1);
    const detail = panel.findings[0]!.detail.toLowerCase();
    assert.ok(detail.includes('outside'));
    assert.ok(!detail.includes('production authorized'));
    assert.ok(!detail.includes('certified'));
  });
});
