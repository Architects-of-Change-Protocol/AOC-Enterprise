import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture, PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID } from '../../pmfreak-agent-passport/index.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID, PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID } from '../pmfreak-project-governance-scenario-constants.js';
import { PMFREAK_SCENARIO_CONTROL_PLANE_SAFE_LABELS, createPMFreakProjectGovernanceScenarioControlPlaneSummary } from '../pmfreak-scenario-control-plane-summary.js';
import { createPMFreakProjectGovernanceScenarioExportMetadata } from '../pmfreak-scenario-export-metadata.js';
import { assertNoPMFreakScenarioOverclaim } from '../pmfreak-scenario-claim-safety.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

function runFullBillingReadiness() {
  return runPMFreakProjectGovernanceScenario(
    {
      scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
      overrideEvidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
      overrideApprovalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
    },
    scenarioRegistry,
    passportRegistry,
  );
}

describe('Control Plane summary is claim-safe', () => {
  it('31. carries every documented safe label and no unsafe claim', () => {
    const summary = createPMFreakProjectGovernanceScenarioControlPlaneSummary(runFullBillingReadiness());

    for (const label of [
      'PMFreak project governance scenario',
      'AOC-governed agent',
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
  it('32. includes the scenario id, passport resolution, missing evidence/approvals, and trace, and passes overclaim scanning', () => {
    const result = runFullBillingReadiness();
    const scenario = scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID);
    assert.ok(scenario !== undefined);

    const metadata = createPMFreakProjectGovernanceScenarioExportMetadata(result, scenario!.projectContext);

    assert.equal(metadata.scenarioId, PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID);
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
  it('33. preserves the Costa Rica jurisdiction pack reference as jurisdiction context only', () => {
    const result = runFullBillingReadiness();
    assert.ok(result.jurisdictionPackIds.includes('aoc.jurisdiction.costa_rica.base.v1'));

    // Jurisdiction context reference only -- never a Costa Rica compliance claim.
    for (const value of [result.safeNarrative, JSON.stringify(result.scenarioTrace)]) {
      assert.ok(!value.toLowerCase().includes('costa rica compliant'));
      assert.ok(!value.toLowerCase().includes('complies with costa rica'));
    }
  });

  it('34. preserves both the agent-passport and project-governance-scenario policy pack ids', () => {
    const result = runFullBillingReadiness();

    assert.ok(result.appliedPolicyPackIds.includes(PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID));
    assert.ok(result.appliedPolicyPackIds.includes(PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID));
  });
});
