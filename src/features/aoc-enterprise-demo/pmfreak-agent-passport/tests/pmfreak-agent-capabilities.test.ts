import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePMFreakAgentPassportAction } from '../pmfreak-passport-resolver.js';
import { buildPMFreakActionAttemptFixture, buildPMFreakAgentPassportRegistryFixture } from '../pmfreak-agent-passport-fixtures.js';

const registry = buildPMFreakAgentPassportRegistryFixture();

describe('Planning Agent capability scenarios', () => {
  it('14. can propose a schedule change once evidence is supplied', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-planning-propose-change',
        agentId: 'pmfreak.agent.planning',
        passportId: 'aoc.passport.pmfreak.planning.demo.v1',
        actionId: 'pmfreak.action.schedule.propose_change',
        evidenceIds: ['pmfreak.evidence.schedule_baseline', 'pmfreak.evidence.dependency_record'],
      }),
      registry,
    );

    assert.ok(['allow', 'require_pm_approval'].includes(resolution.decision));
    assert.equal(resolution.allowedByPassport, true);
    assert.equal(resolution.allowedByCapability, true);
    assert.equal(resolution.allowedByAuthorityScope, true);
  });

  it('15. cannot apply a schedule change, even with evidence and approval supplied', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-planning-apply-change',
        agentId: 'pmfreak.agent.planning',
        passportId: 'aoc.passport.pmfreak.planning.demo.v1',
        actionId: 'pmfreak.action.schedule.apply_change',
        evidenceIds: ['pmfreak.evidence.schedule_baseline'],
        approvalIds: ['pmfreak.approval.pm_approval'],
      }),
      registry,
    );

    assert.equal(resolution.decision, 'deny');
  });
});

describe('Risk Agent capability scenarios', () => {
  it('16. can create a risk draft', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-risk-create-draft',
        agentId: 'pmfreak.agent.risk',
        passportId: 'aoc.passport.pmfreak.risk.demo.v1',
        actionId: 'pmfreak.action.risk.create_draft',
      }),
      registry,
    );

    assert.equal(resolution.decision, 'allow');
  });

  it('17. cannot close a risk without PM approval', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-risk-close',
        agentId: 'pmfreak.agent.risk',
        passportId: 'aoc.passport.pmfreak.risk.demo.v1',
        actionId: 'pmfreak.action.risk.close',
        evidenceIds: ['pmfreak.evidence.risk_record'],
      }),
      registry,
    );

    assert.ok(['deny', 'require_pm_approval'].includes(resolution.decision));
  });
});

describe('Evidence Agent capability scenarios', () => {
  it('18. can prepare an evidence bundle once deliverable evidence is supplied', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-evidence-prepare-bundle',
        agentId: 'pmfreak.agent.evidence',
        passportId: 'aoc.passport.pmfreak.evidence.demo.v1',
        actionId: 'pmfreak.action.evidence.prepare_bundle',
        evidenceIds: ['pmfreak.evidence.deliverable_evidence'],
      }),
      registry,
    );

    assert.equal(resolution.decision, 'allow');
  });

  it('19. cannot certify customer acceptance -- no such action exists in the PMFreak catalog', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-evidence-certify-acceptance',
        agentId: 'pmfreak.agent.evidence',
        passportId: 'aoc.passport.pmfreak.evidence.demo.v1',
        actionId: 'pmfreak.action.evidence.certify_customer_acceptance',
      }),
      registry,
    );

    assert.equal(resolution.decision, 'deny');
  });
});

describe('Client Communication Agent capability scenarios', () => {
  it('20. can draft a client update', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-comms-draft',
        agentId: 'pmfreak.agent.client_communication',
        passportId: 'aoc.passport.pmfreak.client_communication.demo.v1',
        actionId: 'pmfreak.action.communication.draft_client_update',
      }),
      registry,
    );

    assert.equal(resolution.decision, 'allow');
  });

  it('21. cannot send an external communication without approval', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-comms-send',
        agentId: 'pmfreak.agent.client_communication',
        passportId: 'aoc.passport.pmfreak.client_communication.demo.v1',
        actionId: 'pmfreak.action.communication.send_client_update',
        evidenceIds: ['pmfreak.evidence.client_communication_draft'],
        context: { customerFacing: true, externalCommunication: true },
      }),
      registry,
    );

    assert.ok(['require_pm_approval', 'deny'].includes(resolution.decision));
    assert.equal(resolution.approvalsSatisfied, false);
    assert.ok(resolution.missingApprovalIds.includes('pmfreak.approval.pm_approval'));
  });
});

describe('Change Control Agent capability scenarios', () => {
  it('27. can classify a change request once the change request record is supplied', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-change-classify',
        agentId: 'pmfreak.agent.change_control',
        passportId: 'aoc.passport.pmfreak.change_control.demo.v1',
        actionId: 'pmfreak.action.change_control.classify_request',
        evidenceIds: ['pmfreak.evidence.change_request_record'],
      }),
      registry,
    );

    assert.equal(resolution.decision, 'allow');
  });

  it('28. cannot approve a change request', () => {
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-change-approve',
        agentId: 'pmfreak.agent.change_control',
        passportId: 'aoc.passport.pmfreak.change_control.demo.v1',
        actionId: 'pmfreak.action.change_control.approve_request',
        evidenceIds: ['pmfreak.evidence.change_request_record'],
        approvalIds: ['pmfreak.approval.pm_approval'],
      }),
      registry,
    );

    assert.ok(['deny', 'require_pm_approval'].includes(resolution.decision));
  });
});
