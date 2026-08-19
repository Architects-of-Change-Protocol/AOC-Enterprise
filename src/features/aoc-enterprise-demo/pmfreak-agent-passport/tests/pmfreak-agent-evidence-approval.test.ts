import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePMFreakAgentPassportAction } from '../pmfreak-passport-resolver.js';
import { buildPMFreakActionAttemptFixture, buildPMFreakAgentPassportRegistryFixture } from '../pmfreak-agent-passport-fixtures.js';

const registry = buildPMFreakAgentPassportRegistryFixture();

describe('Context-sensitive review routing', () => {
  it('22. a customer-commitment, contract-sensitive attempt requires contract review or customer validation', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-customer-commitment',
        agentId: 'pmfreak.agent.client_communication',
        passportId: 'aoc.passport.pmfreak.client_communication.demo.v1',
        actionId: 'pmfreak.action.communication.draft_client_update',
        projectPhase: 'planning',
        context: { customerCommitment: true, contractSensitive: true },
      }),
      registry,
    );

    assert.ok(['require_contract_review', 'require_customer_validation'].includes(resolution.decision));
  });

  it('29. a contract-sensitive attempt requires contract review', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-contract-sensitive',
        agentId: 'pmfreak.agent.change_control',
        passportId: 'aoc.passport.pmfreak.change_control.demo.v1',
        actionId: 'pmfreak.action.change_control.classify_request',
        evidenceIds: ['pmfreak.evidence.change_request_record'],
        context: { contractSensitive: true },
      }),
      registry,
    );

    assert.equal(resolution.decision, 'require_contract_review');
  });

  it('30. a legal-sensitive attempt requires legal review', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-legal-sensitive',
        agentId: 'pmfreak.agent.risk',
        passportId: 'aoc.passport.pmfreak.risk.demo.v1',
        actionId: 'pmfreak.action.risk.create_draft',
        context: { legalSensitive: true },
      }),
      registry,
    );

    assert.equal(resolution.decision, 'require_legal_review');
  });

  it('31. a billing-sensitive attempt requires billing review', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-billing-sensitive',
        agentId: 'pmfreak.agent.billing_readiness',
        passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
        actionId: 'pmfreak.action.billing.check_readiness',
        projectPhase: 'billing',
        evidenceIds: ['pmfreak.evidence.billing_milestone_record', 'pmfreak.evidence.deliverable_evidence'],
        context: { billingSensitive: true },
      }),
      registry,
    );

    assert.equal(resolution.decision, 'require_billing_review');
  });
});

describe('Billing Readiness Agent -- the primary demo scenario', () => {
  it('23. can check billing readiness once the relevant evidence is supplied', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-billing-check-ready',
        agentId: 'pmfreak.agent.billing_readiness',
        passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
        actionId: 'pmfreak.action.billing.check_readiness',
        projectPhase: 'billing',
        evidenceIds: ['pmfreak.evidence.billing_milestone_record', 'pmfreak.evidence.deliverable_evidence'],
      }),
      registry,
    );

    assert.equal(resolution.decision, 'allow');
  });

  it('23b. requires evidence when checking billing readiness without any evidence supplied', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-billing-check-ready-no-evidence',
        agentId: 'pmfreak.agent.billing_readiness',
        passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
        actionId: 'pmfreak.action.billing.check_readiness',
        projectPhase: 'billing',
      }),
      registry,
    );

    assert.equal(resolution.decision, 'require_evidence');
  });

  it('24. cannot mark a milestone billing-ready without customer acceptance evidence', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-billing-mark-ready-no-acceptance',
        agentId: 'pmfreak.agent.billing_readiness',
        passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
        actionId: 'pmfreak.action.billing.mark_ready',
        projectPhase: 'billing',
        evidenceIds: ['pmfreak.evidence.deliverable_evidence'],
        approvalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
      }),
      registry,
    );

    assert.equal(resolution.decision, 'require_evidence');
    assert.ok(resolution.missingEvidenceIds.includes('pmfreak.evidence.customer_acceptance_record'));
  });

  it('25. cannot mark a milestone billing-ready without billing review approval', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-billing-mark-ready-no-billing-review',
        agentId: 'pmfreak.agent.billing_readiness',
        passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
        actionId: 'pmfreak.action.billing.mark_ready',
        projectPhase: 'billing',
        evidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
        approvalIds: ['pmfreak.approval.pm_approval'],
      }),
      registry,
    );

    assert.equal(resolution.decision, 'require_billing_review');
    assert.ok(resolution.missingApprovalIds.includes('pmfreak.approval.billing_review'));
  });

  it('26. can mark a milestone billing-ready only once both evidence and approvals are fully satisfied', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-billing-mark-ready-complete',
        agentId: 'pmfreak.agent.billing_readiness',
        passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
        actionId: 'pmfreak.action.billing.mark_ready',
        projectPhase: 'billing',
        evidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
        approvalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
      }),
      registry,
    );

    assert.equal(resolution.decision, 'allow');
    assert.equal(resolution.evidenceSatisfied, true);
    assert.equal(resolution.approvalsSatisfied, true);

    // This means Soberanía allows the *agent action* to mark readiness in the demo --
    // it must never be read as certifying invoice validity, customer acceptance,
    // or guaranteed billing.
    const rendered = JSON.stringify(resolution).toLowerCase();
    assert.ok(!rendered.includes('invoice is legally valid'));
    assert.ok(!rendered.includes('customer acceptance is certified'));
    assert.ok(!rendered.includes('billing is guaranteed'));
  });
});
