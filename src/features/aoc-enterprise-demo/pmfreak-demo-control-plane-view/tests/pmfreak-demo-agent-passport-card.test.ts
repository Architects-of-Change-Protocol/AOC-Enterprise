import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import type { AgentPassportStatus } from '@aoc-enterprise/agent-governance';
import {
  PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  createPMFreakProjectGovernanceScenarioRegistry,
  demoPMFreakProjectGovernanceScenarios,
  getPMFreakRealAgentPassportFixtures,
  runPMFreakProjectGovernanceScenario,
} from '../../pmfreak-project-governance-scenarios/index.js';
import type { PMFreakProjectGovernanceScenarioRunResult, PMFreakScenarioRunnerDeps } from '../../pmfreak-project-governance-scenarios/index.js';
import { createPMFreakDemoAgentPassportCard } from '../pmfreak-demo-agent-passport-card.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let baseResult: PMFreakProjectGovernanceScenarioRunResult;

before(async () => {
  const runnerDeps: PMFreakScenarioRunnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
  baseResult = await runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID }, scenarioRegistry, runnerDeps);
});

/**
 * `createPMFreakDemoAgentPassportCard` only relabels an already-computed `passportResolution` --
 * it never re-derives passport status or gate outcomes. Rather than re-authoring a whole
 * hand-built `PMFreakAgentPassportResolution` (a shape now owned by the real
 * `@aoc-enterprise/pmfreak-agent-passport-foundation` package), this swaps only the fields that
 * differ by passport status on top of one real, fully-resolved run result.
 */
function withPassportStatus(passportStatus: AgentPassportStatus): PMFreakProjectGovernanceScenarioRunResult {
  const allowed = passportStatus === 'active';
  return {
    ...baseResult,
    passportResolution: {
      ...baseResult.passportResolution,
      passportStatus,
      allowedByRuntimeGuard: allowed,
      allowedByCapabilityToken: allowed,
      allowedByAuthorityScope: allowed,
    },
  };
}

describe('createPMFreakDemoAgentPassportCard', () => {
  it('8. reflects an active passport as success', () => {
    const card = createPMFreakDemoAgentPassportCard(withPassportStatus('active'));

    assert.equal(card.passportStatus, 'active');
    assert.equal(card.statusSeverity, 'success');
    assert.equal(card.allowedByRuntimeGuard, true);
  });

  it('9. reflects a revoked passport as danger', () => {
    const card = createPMFreakDemoAgentPassportCard(withPassportStatus('revoked'));

    assert.equal(card.passportStatus, 'revoked');
    assert.equal(card.statusSeverity, 'danger');
  });

  it('10. reflects a suspended passport as warning', () => {
    const card = createPMFreakDemoAgentPassportCard(withPassportStatus('suspended'));

    assert.equal(card.passportStatus, 'suspended');
    assert.equal(card.statusSeverity, 'warning');
  });

  it('reflects an expired passport as danger', () => {
    const card = createPMFreakDemoAgentPassportCard(withPassportStatus('expired'));

    assert.equal(card.statusSeverity, 'danger');
  });

  it('never claims full trust, certification, or production authorization', () => {
    const card = createPMFreakDemoAgentPassportCard(withPassportStatus('active'));
    const text = JSON.stringify(card).toLowerCase();

    assert.ok(!text.includes('fully trusted'));
    assert.ok(!text.includes('certified'));
    assert.ok(!text.includes('production authorized'));
    assert.ok(card.notes.includes('AOC-governed agent'));
  });
});
