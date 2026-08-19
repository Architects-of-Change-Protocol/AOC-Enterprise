import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { billingReadinessCheckReadinessScenario, demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { getPMFreakRealAgentPassportFixtures } from '../pmfreak-real-agent-passport-fixtures.js';
import { PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID, PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID } from '../pmfreak-project-governance-scenario-constants.js';
import { PMFREAK_SCENARIO_CONTROL_PLANE_SAFE_LABELS, createPMFreakProjectGovernanceScenarioControlPlaneSummary } from '../pmfreak-scenario-control-plane-summary.js';
import { createPMFreakProjectGovernanceScenarioExportMetadata } from '../pmfreak-scenario-export-metadata.js';
import { assertNoPMFreakScenarioOverclaim } from '../pmfreak-scenario-claim-safety.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

function runFullBillingReadiness() {
  return runPMFreakProjectGovernanceScenario(
    {
      scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
      overrideEvidenceIds: [...billingReadinessCheckReadinessScenario.baselineEvidenceIds],
      overrideApprovalIds: [...billingReadinessCheckReadinessScenario.baselineApprovalIds],
    },
    scenarioRegistry,
    runnerDeps,
  );
}

describe('Control Plane summary is claim-safe', () => {
  it('31. carries every documented safe label and no unsafe claim', async () => {
    const summary = createPMFreakProjectGovernanceScenarioControlPlaneSummary(await runFullBillingReadiness());

    for (const label of [
      'PMFreak project governance scenario',
      'Soberanía-governed agent',
      'Demo scenario',
      'Passport-gated',
      'Capability-gated',
      'Authority-scoped',
      'Evidence required',
      'Approval required',
      'Audit-ready',
      'Not production integration',
      'Not compliance certification',
    ]) {
      assert.ok(summary.safeDisplayLabels.includes(label), `expected safe labels to include "${label}"`);
    }

    for (const forbidden of ['Invoice ready certified', 'Customer acceptance certified', 'Fully trusted agent', 'Risk-free execution', 'Legally approved', 'Compliance passed']) {
      assert.ok(!summary.safeDisplayLabels.includes(forbidden), `expected safe labels to never include "${forbidden}"`);
    }

    assert.deepEqual([...summary.safeDisplayLabels], [...PMFREAK_SCENARIO_CONTROL_PLANE_SAFE_LABELS]);
    assertNoPMFreakScenarioOverclaim(summary);
  });
});

describe('Export metadata is claim-safe', () => {
  it('32. includes the scenario id, passport resolution, missing evidence/approvals, and trace, and passes overclaim scanning', async () => {
    const result = await runFullBillingReadiness();
    const scenario = scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID);
    assert.ok(scenario !== undefined);

    const metadata = createPMFreakProjectGovernanceScenarioExportMetadata(result, scenario!.projectContext);

    assert.equal(metadata.scenarioId, PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID);
    assert.equal(metadata.packId, PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID);
    assert.deepEqual(metadata.passportResolution, result.passportResolution);
    assert.deepEqual([...metadata.missingEvidenceIds], []);
    assert.deepEqual([...metadata.missingApprovalIds], []);
    assert.ok(metadata.scenarioTrace.length > 0);
    assert.equal(metadata.safeFraming.demoOnly, true);
    assert.equal(metadata.safeFraming.notLegalAdvice, true);

    assertNoPMFreakScenarioOverclaim(metadata);
  });
});

describe('Scenario results preserve jurisdiction and policy pack references', () => {
  it('33. preserves the Costa Rica jurisdiction pack reference as jurisdiction context only', async () => {
    const result = await runFullBillingReadiness();
    assert.ok(result.jurisdictionPackIds.includes('aoc.jurisdiction.costa_rica.base.v1'));

    // Jurisdiction context reference only -- never a Costa Rica compliance claim.
    for (const value of [result.safeNarrative, JSON.stringify(result.scenarioTrace)]) {
      assert.ok(!value.toLowerCase().includes('costa rica compliant'));
      assert.ok(!value.toLowerCase().includes('complies with costa rica'));
    }
  });

  /**
   * The old demo pack's `appliedPolicyPackIds` carried both a governing agent-passport pack id and
   * this scenario pack's own id. Under the real model, `@aoc-enterprise/pmfreak-agent-passport-foundation`
   * is a workspace code dependency, not a `PolicyPackManifest`-shaped pack -- there is no
   * agent-passport-specific policy pack id to look for. `appliedPolicyPackIds` is now computed
   * entirely by the runner from this scenario pack's own id plus the scenario's own project
   * context `policyPackIds`.
   */
  it('34. preserves the project-governance-scenario policy pack id', async () => {
    const result = await runFullBillingReadiness();

    assert.ok(result.appliedPolicyPackIds.includes(PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID));
  });
});
