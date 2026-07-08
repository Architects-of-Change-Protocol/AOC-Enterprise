import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakAgentPassportRegistryFixture } from '../../pmfreak-agent-passport/index.js';
import { runPMFreakProjectGovernanceScenario } from '../pmfreak-scenario-runner.js';
import { createPMFreakProjectGovernanceScenarioRegistry } from '../pmfreak-scenario-registry.js';
import { demoPMFreakProjectGovernanceScenarios } from '../scenarios/index.js';
import { PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID } from '../pmfreak-project-governance-scenario-constants.js';
import { assertNoPMFreakScenarioOverclaim } from '../pmfreak-scenario-claim-safety.js';

const scenarioRegistry = createPMFreakProjectGovernanceScenarioRegistry(demoPMFreakProjectGovernanceScenarios);
const passportRegistry = buildPMFreakAgentPassportRegistryFixture();

function runBillingReadiness(overrideEvidenceIds: readonly string[], overrideApprovalIds: readonly string[]) {
  return runPMFreakProjectGovernanceScenario({ scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID, overrideEvidenceIds, overrideApprovalIds }, scenarioRegistry, passportRegistry);
}

describe('Billing Readiness -- Mark Milestone Ready', () => {
  it('6. missing customer acceptance evidence requires evidence', () => {
    const result = runBillingReadiness(['pmfreak.evidence.deliverable_evidence'], ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review']);

    assert.equal(result.decision, 'require_evidence');
    assert.ok(result.missingEvidenceIds.includes('pmfreak.evidence.customer_acceptance_record'));
  });

  it('7. full evidence but missing billing approval requires billing review', () => {
    const result = runBillingReadiness(['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'], ['pmfreak.approval.pm_approval']);

    assert.equal(result.decision, 'require_billing_review');
    assert.ok(result.missingApprovalIds.includes('pmfreak.approval.billing_review'));
  });

  it('8. full evidence and approvals allow -- and never claim invoice validity or acceptance certification', () => {
    const result = runBillingReadiness(
      ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
      ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
    );

    assert.equal(result.decision, 'allow');
    assert.equal(result.evidenceSatisfied, true);
    assert.equal(result.approvalsSatisfied, true);

    const narrative = result.safeNarrative.toLowerCase();
    assert.ok(!narrative.includes('invoice is valid'));
    assert.ok(!narrative.includes('customer acceptance certified'));
    assertNoPMFreakScenarioOverclaim(result);
  });

  it('never requires only a missing evidence signal that the resolver does not actually gate on', () => {
    const scenario = scenarioRegistry.findByScenarioId(PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID);
    assert.ok(scenario !== undefined);
    assert.deepEqual([...scenario!.requiredEvidenceIds].sort(), ['pmfreak.evidence.customer_acceptance_record', 'pmfreak.evidence.deliverable_evidence']);
    assert.deepEqual([...scenario!.requiredApprovalIds].sort(), ['pmfreak.approval.billing_review', 'pmfreak.approval.pm_approval']);
  });
});
