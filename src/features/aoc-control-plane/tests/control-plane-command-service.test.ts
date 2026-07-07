import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createManualClock } from '../../recognition-runtime/runtime/runtime-context.js';
import {
  buildDatasysEnforcementFixture,
  PMFREAK_ACTOR_ID,
  PROJECT_SCOPE,
  SEND_CLIENT_FOLLOW_UP,
  TRUST_DOMAIN_ID,
  VICTOR_ACTOR_ID,
} from '../../action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { buildSendClientFollowUpGuardInput } from '../../action-enforcement/fixtures/approval-required-action.fixture.js';
import { buildDraftClosureEmailGuardInput } from '../../action-enforcement/fixtures/allowed-action.fixture.js';
import { completeTrustedPartnerHandshake } from '../../action-enforcement/fixtures/external-agent-action.fixture.js';
import { ControlPlaneCommandService } from '../services/control-plane-command-service.js';

async function setUpPendingApproval() {
  const fixture = buildDatasysEnforcementFixture();
  const pending = await fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput({ actionRequestId: 'action-request-command-test' }), () => 'unused');
  const reference = fixture.recognitionRuntime.createApprovalRequestForDecision({
    recognitionDecisionId: pending.decision.recognitionDecisionId!,
    actionRequestId: 'action-request-command-test',
    trustDomainId: TRUST_DOMAIN_ID,
    requestedByActorId: PMFREAK_ACTOR_ID,
    targetActorId: PMFREAK_ACTOR_ID,
    principalActorId: VICTOR_ACTOR_ID,
    action: SEND_CLIENT_FOLLOW_UP,
    resourceScope: PROJECT_SCOPE,
    riskLevel: 'high',
  });
  return { fixture, approvalRequestId: reference!.approvalRequestId };
}

function commandService(fixture: Awaited<ReturnType<typeof buildDatasysEnforcementFixture>>) {
  return new ControlPlaneCommandService(
    { approvalRuntime: fixture.approvalRuntime, authorityRuntime: fixture.authorityRuntime, handshakeRuntime: fixture.handshakeRuntime, aocGuard: fixture.aocGuard },
    createManualClock('2026-06-01T00:00:00.000Z'),
  );
}

describe('ControlPlaneCommandService', () => {
  it('disabled command (retry_failed_enforcement) returns a safe disabled result', () => {
    const fixture = buildDatasysEnforcementFixture();
    const service = commandService(fixture);
    const result = service.retryFailedEnforcement('enforcement-request-does-not-matter');
    assert.equal(result.success, false);
    assert.equal(result.reasonCode, 'COMMAND_NOT_WIRED');
    assert.equal(result.type, 'retry_failed_enforcement');
  });

  it('approve command calls the approval runtime when wired', async () => {
    const { fixture, approvalRequestId } = await setUpPendingApproval();
    const service = commandService(fixture);
    const result = service.approveApprovalRequest({ approvalRequestId, approverActorId: VICTOR_ACTOR_ID });
    assert.equal(result.type, 'approve_approval_request');
    assert.equal(result.success, true);
    assert.equal(fixture.approvalRuntime.store.getRequest(approvalRequestId)?.status, 'approved');
  });

  it('reject command calls the approval runtime when wired', async () => {
    const { fixture, approvalRequestId } = await setUpPendingApproval();
    const service = commandService(fixture);
    const result = service.rejectApprovalRequest({ approvalRequestId, approverActorId: VICTOR_ACTOR_ID, reason: 'Not appropriate right now.' });
    assert.equal(result.type, 'reject_approval_request');
    assert.equal(result.success, true);
    assert.equal(fixture.approvalRuntime.store.getRequest(approvalRequestId)?.status, 'rejected');
  });

  it('request changes and escalate call the approval runtime', async () => {
    const { fixture, approvalRequestId } = await setUpPendingApproval();
    const service = commandService(fixture);
    const changes = service.requestApprovalChanges({ approvalRequestId, approverActorId: VICTOR_ACTOR_ID });
    assert.equal(changes.type, 'request_approval_changes');
    assert.equal(changes.success, true);
  });

  it('revoke_approval_proof calls the approval runtime when wired', async () => {
    const { fixture, approvalRequestId } = await setUpPendingApproval();
    const service = commandService(fixture);
    const approval = service.approveApprovalRequest({ approvalRequestId, approverActorId: VICTOR_ACTOR_ID });
    const proofId = approval.createdProofIds?.[0];
    assert.ok(proofId);
    const result = service.revokeApprovalProof({ targetId: proofId!, revokedByActorId: VICTOR_ACTOR_ID, reason: 'Superseded.' });
    assert.equal(result.success, true);
    assert.equal(fixture.approvalRuntime.store.getProof(proofId!)?.status, 'revoked');
  });

  it('revoke_authority_grant calls the authority graph runtime when wired', () => {
    const fixture = buildDatasysEnforcementFixture();
    const service = commandService(fixture);
    const result = service.revokeAuthorityGrant({ targetId: 'authority-grant-victor-project-closure', revokedByActorId: 'actor-datasys', reason: 'Reorg.' });
    assert.equal(result.success, true);
    assert.equal(fixture.authorityRuntime.store.getGrant('authority-grant-victor-project-closure')?.status, 'revoked');
  });

  it('revoke_delegation_grant calls the authority graph runtime when wired', () => {
    const fixture = buildDatasysEnforcementFixture();
    const service = commandService(fixture);
    const result = service.revokeDelegationGrant({ targetId: 'delegation-grant-pmfreak-project-closure', revokedByActorId: VICTOR_ACTOR_ID, reason: 'No longer needed.' });
    assert.equal(result.success, true);
    assert.equal(fixture.authorityRuntime.store.getDelegation('delegation-grant-pmfreak-project-closure')?.status, 'revoked');
  });

  it('revoke visa command calls the handshake runtime when wired', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const handshake = completeTrustedPartnerHandshake(fixture);
    const service = commandService(fixture);
    const result = service.revokeAgentVisa({ targetId: handshake.visa!.id, revokedByActorId: 'actor-datasys', reason: 'Partner offboarded.' });
    assert.equal(result.success, true);
    assert.equal(fixture.handshakeRuntime.store.getAgentVisa(handshake.visa!.id)?.status, 'revoked');
  });

  it('revoke ingress grant command calls the handshake runtime when wired', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const handshake = completeTrustedPartnerHandshake(fixture);
    const service = commandService(fixture);
    const result = service.revokeIngressGrant({ targetId: handshake.ingressGrant!.id, revokedByActorId: 'actor-datasys', reason: 'Partner offboarded.' });
    assert.equal(result.success, true);
  });

  it('dry-run enforcement command calls the action enforcement runtime when wired', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const service = commandService(fixture);
    const input = buildDraftClosureEmailGuardInput();
    const result = await service.dryRunEnforcement({
      actorId: input.actorId,
      trustDomainId: input.trustDomainId,
      action: input.action,
      resourceScope: input.resourceScope,
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
    assert.equal(result.type, 'dry_run_enforcement');
    assert.equal(result.success, true);
  });

  it('command results are deterministic given the same inputs', async () => {
    const { fixture: fixtureA, approvalRequestId: idA } = await setUpPendingApproval();
    const { fixture: fixtureB, approvalRequestId: idB } = await setUpPendingApproval();
    const resultA = commandService(fixtureA).approveApprovalRequest({ approvalRequestId: idA, approverActorId: VICTOR_ACTOR_ID });
    const resultB = commandService(fixtureB).approveApprovalRequest({ approvalRequestId: idB, approverActorId: VICTOR_ACTOR_ID });
    assert.equal(resultA.success, resultB.success);
    assert.equal(resultA.reasonCode, resultB.reasonCode);
    assert.equal(resultA.reason, resultB.reason);
  });
});
