import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  getPMFreakRealAgentPassportFixtures,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakScenarioRunnerDeps } from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoAuthorityScopePanel } from '../pmfreak-demo-authority-panel.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

describe('createPMFreakDemoAuthorityScopePanel', () => {
  it('shows an in-scope attempt as satisfied', async () => {
    const result = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID }, scenarioRegistry, runnerDeps);
    const panel = createPMFreakDemoAuthorityScopePanel(result);

    assert.equal(panel.allowedByAuthorityScope, true);
    assert.equal(panel.status, 'satisfied');
  });

  it('12. shows a failed scope safely for an out-of-scope authority override, with no production authorization claim', async () => {
    const result = await runPMFreakProjectGovernanceScenario(
      {
        scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
        // The real model separates authority scope from passport identity entirely -- there is no
        // "out of scope passport" fixture; overrideAuthorityScope exercises the same denial by
        // scoping this attempt to a workspace/project the scenario's real project context is not in.
        overrideAuthorityScope: {
          workspaceIds: ['workspace.demo.out-of-scope-harbor'],
          projectIds: ['project.demo.out-of-scope-harbor'],
          customerIds: [],
          allowedProjectPhases: ['initiation', 'planning', 'execution', 'monitoring', 'closure', 'billing'],
        },
      },
      scenarioRegistry,
      runnerDeps,
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
