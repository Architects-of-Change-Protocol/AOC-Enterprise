import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import type { PMFreakScenarioRunnerDeps } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios, billingReadinessCheckReadinessScenario } from '../scenarios/index.js';
import { getPMFreakRealAgentPassportFixtures } from '../pmfreak-real-agent-passport-fixtures.js';
import { PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID } from '../pmfreak-project-governance-scenario-constants.js';
import { assertNoPMFreakScenarioOverclaim } from '../pmfreak-scenario-claim-safety.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
let runnerDeps: PMFreakScenarioRunnerDeps;

before(async () => {
  runnerDeps = { fixtures: await getPMFreakRealAgentPassportFixtures() };
});

const [DELIVERABLE_EVIDENCE_ID, CUSTOMER_ACCEPTANCE_EVIDENCE_ID] = billingReadinessCheckReadinessScenario.baselineEvidenceIds;
const [PM_APPROVAL_ID, BILLING_REVIEW_ID] = billingReadinessCheckReadinessScenario.baselineApprovalIds;

function runBillingReadiness(overrideEvidenceIds: readonly string[], overrideApprovalIds: readonly string[]) {
  return runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID, overrideEvidenceIds, overrideApprovalIds }, scenarioRegistry, runnerDeps);
}

describe('Billing Readiness -- Check Milestone Readiness', () => {
  it('6. missing customer acceptance evidence requires evidence', async () => {
    const result = await runBillingReadiness([DELIVERABLE_EVIDENCE_ID!], [PM_APPROVAL_ID!, BILLING_REVIEW_ID!]);

    assert.equal(result.decision, 'require_evidence');
    assert.ok(result.missingEvidenceIds.includes(CUSTOMER_ACCEPTANCE_EVIDENCE_ID!));
  });

  it('7. full evidence but missing billing approval requires billing review', async () => {
    const result = await runBillingReadiness([DELIVERABLE_EVIDENCE_ID!, CUSTOMER_ACCEPTANCE_EVIDENCE_ID!], [PM_APPROVAL_ID!]);

    assert.equal(result.decision, 'require_billing_review');
    assert.ok(result.missingApprovalIds.includes(BILLING_REVIEW_ID!));
  });

  it('8. full evidence and approvals allow -- and never claim invoice validity or acceptance certification', async () => {
    const result = await runBillingReadiness([DELIVERABLE_EVIDENCE_ID!, CUSTOMER_ACCEPTANCE_EVIDENCE_ID!], [PM_APPROVAL_ID!, BILLING_REVIEW_ID!]);

    assert.equal(result.decision, 'allow');
    assert.equal(result.evidenceSatisfied, true);
    assert.equal(result.approvalsSatisfied, true);

    const narrative = result.safeNarrative.toLowerCase();
    assert.ok(!narrative.includes('invoice is valid'));
    assert.ok(!narrative.includes('customer acceptance certified'));
    assertNoPMFreakScenarioOverclaim(result);
  });

  it('never requires only a missing evidence signal that the resolver does not actually gate on', () => {
    const scenario = scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID);
    assert.ok(scenario !== undefined);
    assert.deepEqual(
      [...scenario!.evidenceRequirements.map((requirement) => requirement.id)].sort(),
      ['ev.pmfreak.scenario.billing_readiness.customer_acceptance_record', 'ev.pmfreak.scenario.billing_readiness.deliverable_evidence'],
    );
    assert.deepEqual(
      [...scenario!.approvalRequirements.map((requirement) => requirement.id)].sort(),
      ['appr.pmfreak.scenario.billing_readiness.billing_review', 'appr.pmfreak.scenario.billing_readiness.pm_approval'],
    );
  });
});
