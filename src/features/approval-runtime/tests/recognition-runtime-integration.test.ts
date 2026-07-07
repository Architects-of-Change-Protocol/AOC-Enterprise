import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityGraphRuntime } from '../../authority-graph/runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../../authority-graph/runtime/authority-runtime-context.js';
import { createAocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createManualClock, createSequentialIdGenerator, type RuntimeContext } from '../../recognition-runtime/runtime/runtime-context.js';
import { buildDatasysApprovalWorld, PROJECT_SCOPE } from '../fixtures/datasys-approval.fixture.js';
import { buildPmfreakApprovalFixture, buildSendClientFollowUpActionRequest, SEND_CLIENT_FOLLOW_UP_ACTION } from '../fixtures/pmfreak-approval.fixture.js';
import { createApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { ApprovalRuntime } from '../runtime/approval-runtime.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp() {
  const recognitionClock = createManualClock(NOW);
  const recognitionCtx: RuntimeContext = { clock: recognitionClock, idGenerator: createSequentialIdGenerator() };
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(NOW));
  const approvalRuntime = new ApprovalRuntime(createApprovalRuntimeContext(NOW), { authorityGraph: authorityRuntime });
  const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityRuntime, approvalRuntime);

  const world = buildDatasysApprovalWorld(recognitionRuntime, authorityRuntime, approvalRuntime);
  const fixture = buildPmfreakApprovalFixture(recognitionRuntime, approvalRuntime, world);

  authorityRuntime.createDelegationGrant({
    delegatorActorId: world.victor.id,
    delegateActorId: world.pmfreak.id,
    delegateActorType: 'agent',
    trustDomainId: world.trustDomainId,
    sourceAuthorityGrantId: world.victorGrant.id,
    capability: 'project_closure.client_communication',
    actions: [SEND_CLIENT_FOLLOW_UP_ACTION, 'draft_closure_email', 'summarize_project_status'],
    resourceScopes: [PROJECT_SCOPE],
    canRedelegate: false,
  });

  return { recognitionClock, recognitionRuntime, authorityRuntime, approvalRuntime, world, fixture };
}

const ACTION_REQUEST_ID = 'action-request-send-client-follow-up';

describe('Approval Runtime + Recognition Runtime integration', () => {
  it('1. action requiring approval returns require_human_approval', () => {
    const { recognitionRuntime, world, fixture } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      buildSendClientFollowUpActionRequest(recognitionRuntime, world, fixture, { id: ACTION_REQUEST_ID }),
    );
    assert.equal(decision.type, 'require_human_approval');
    assert.equal(decision.approvalRequestId, undefined);
  });

  it('2. ApprovalRequest can be created from RecognitionDecision', () => {
    const { recognitionRuntime, world, fixture } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      buildSendClientFollowUpActionRequest(recognitionRuntime, world, fixture, { id: ACTION_REQUEST_ID }),
    );
    const reference = recognitionRuntime.createApprovalRequestForDecision({
      recognitionDecisionId: decision.id,
      actionRequestId: ACTION_REQUEST_ID,
      trustDomainId: world.trustDomainId,
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
    });
    assert.ok(reference);
    assert.equal(reference?.status, 'pending');
  });

  it('3. action with valid ApprovalProof returns allow', () => {
    const { recognitionRuntime, approvalRuntime, world, fixture } = setUp();
    const request = buildSendClientFollowUpActionRequest(recognitionRuntime, world, fixture, { id: ACTION_REQUEST_ID });
    const firstDecision = recognitionRuntime.submitActionRequest(request);
    assert.equal(firstDecision.type, 'require_human_approval');

    const reference = recognitionRuntime.createApprovalRequestForDecision({
      recognitionDecisionId: firstDecision.id,
      actionRequestId: ACTION_REQUEST_ID,
      trustDomainId: world.trustDomainId,
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
    });
    assert.ok(reference);

    approvalRuntime.approve({
      approvalRequestId: reference!.approvalRequestId,
      approverActorId: world.victor.id,
      evidenceReviewed: [
        { id: 'evidence-email-draft-1', type: 'email_draft', providedByActorId: world.pmfreak.id, createdAt: NOW },
      ],
    });

    const secondDecision = recognitionRuntime.submitActionRequest(request);
    assert.equal(secondDecision.type, 'allow');
    assert.ok(secondDecision.approvalProofId);
  });

  it('4. action with invalid ApprovalProof remains require_human_approval or policy_violation', () => {
    const { recognitionRuntime, approvalRuntime, world, fixture } = setUp();
    const request = buildSendClientFollowUpActionRequest(recognitionRuntime, world, fixture, { id: ACTION_REQUEST_ID });
    const firstDecision = recognitionRuntime.submitActionRequest(request);
    const reference = recognitionRuntime.createApprovalRequestForDecision({
      recognitionDecisionId: firstDecision.id,
      actionRequestId: ACTION_REQUEST_ID,
      trustDomainId: world.trustDomainId,
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
    });
    const approvalRequestId = reference!.approvalRequestId;
    approvalRuntime.reject({ approvalRequestId, approverActorId: world.victor.id });

    const secondDecision = recognitionRuntime.submitActionRequest(request);
    assert.ok(secondDecision.type === 'policy_violation' || secondDecision.type === 'require_human_approval');
  });

  it('5. action with revoked ApprovalProof returns policy_violation', () => {
    const { recognitionRuntime, approvalRuntime, world, fixture } = setUp();
    const request = buildSendClientFollowUpActionRequest(recognitionRuntime, world, fixture, { id: ACTION_REQUEST_ID });
    const firstDecision = recognitionRuntime.submitActionRequest(request);
    const reference = recognitionRuntime.createApprovalRequestForDecision({
      recognitionDecisionId: firstDecision.id,
      actionRequestId: ACTION_REQUEST_ID,
      trustDomainId: world.trustDomainId,
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
    });
    const approvalRequestId = reference!.approvalRequestId;
    const submission = approvalRuntime.approve({
      approvalRequestId,
      approverActorId: world.victor.id,
      evidenceReviewed: [{ id: 'evidence-email-draft-1', type: 'email_draft', providedByActorId: world.pmfreak.id, createdAt: NOW }],
    });
    assert.ok(submission.proof);
    approvalRuntime.revokeApproval({ approvalProofId: submission.proof!.id, revokedByActorId: world.datasys.id, reason: 'Compliance hold.' });

    const secondDecision = recognitionRuntime.submitActionRequest(request);
    assert.equal(secondDecision.type, 'policy_violation');
    assert.equal(secondDecision.reasonCode, 'APPROVAL_REVOKED');
  });

  it('6. action with expired ApprovalProof returns require_human_approval or policy_violation', () => {
    const { recognitionRuntime, approvalRuntime, world, fixture, recognitionClock } = setUp();
    approvalRuntime.createApprovalRequirement({
      id: 'approval-requirement-send-client-follow-up-expiring',
      type: 'single_approval',
      trustDomainId: world.trustDomainId,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requiredAuthorityCapability: 'approve_client_communication',
      minimumApprovals: 1,
      requiresSegregationOfDuties: true,
      evidenceRequirements: [],
      expiresInMinutes: 1,
    });

    const request = buildSendClientFollowUpActionRequest(recognitionRuntime, world, fixture, { id: ACTION_REQUEST_ID });
    const firstDecision = recognitionRuntime.submitActionRequest(request);
    const approvalRequest = approvalRuntime.createApprovalRequest({
      trustDomainId: world.trustDomainId,
      actionRequestId: ACTION_REQUEST_ID,
      recognitionDecisionId: firstDecision.id,
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requirement: approvalRuntime.store.getRequirement('approval-requirement-send-client-follow-up-expiring')!,
      evidence: [],
    });
    approvalRuntime.approve({
      approvalRequestId: approvalRequest.id,
      approverActorId: world.victor.id,
      evidenceReviewed: [],
    });

    recognitionClock.advance(2 * 60_000);
    const secondDecision = recognitionRuntime.submitActionRequest({ ...request, requestedAt: recognitionClock.now() });
    assert.ok(secondDecision.type === 'require_human_approval' || secondDecision.type === 'policy_violation');
  });

  it('7. rogue agent remains unrecognized_actor before approval evaluation', () => {
    const { recognitionRuntime, world } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: world.unknownAgent.id,
        trustDomainId: world.trustDomainId,
        action: SEND_CLIENT_FOLLOW_UP_ACTION,
        resource: PROJECT_SCOPE,
      }),
    );
    assert.equal(decision.type, 'unrecognized_actor');
    assert.equal(decision.approvalRequestId, undefined);
  });

  it('8. missing evidence still returns require_more_evidence before approval', () => {
    const { recognitionRuntime, world } = setUp();
    const token = recognitionRuntime.issueCapabilityToken({
      id: 'cap-pmfreak-draft-with-evidence',
      subjectActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      issuerActorId: world.victor.id,
      trustDomainId: world.trustDomainId,
      capability: 'project_closure.drafting',
      actions: ['draft_closure_email'],
      resourceScopes: [PROJECT_SCOPE],
      evidenceRequirements: [{ action: 'draft_closure_email', requiredEvidenceTypes: ['email_thread'] }],
      riskLevel: 'medium',
    });
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: world.pmfreak.id,
        passportId: world.pmfreakPassport.id,
        capabilityTokenId: token.id,
        principalActorId: world.victor.id,
        trustDomainId: world.trustDomainId,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
      }),
    );
    assert.equal(decision.type, 'require_more_evidence');
    assert.equal(decision.approvalRequestId, undefined);
  });

  it('9. revoked capability still returns revoked before approval', () => {
    const { recognitionRuntime, world } = setUp();
    const token = recognitionRuntime.issueCapabilityToken({
      id: 'cap-pmfreak-revoked',
      subjectActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      issuerActorId: world.victor.id,
      trustDomainId: world.trustDomainId,
      capability: 'project_closure.client_communication',
      actions: [SEND_CLIENT_FOLLOW_UP_ACTION],
      resourceScopes: [PROJECT_SCOPE],
      approvalRequirement: { actions: [SEND_CLIENT_FOLLOW_UP_ACTION] },
      riskLevel: 'high',
    });
    recognitionRuntime.revokeCapabilityToken(token.id, world.trustDomainId);
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: world.pmfreak.id,
        passportId: world.pmfreakPassport.id,
        capabilityTokenId: token.id,
        principalActorId: world.victor.id,
        trustDomainId: world.trustDomainId,
        action: SEND_CLIENT_FOLLOW_UP_ACTION,
        resource: PROJECT_SCOPE,
      }),
    );
    assert.equal(decision.type, 'revoked');
    assert.equal(decision.approvalRequestId, undefined);
  });

  it('10. expired capability still returns expired before approval', () => {
    const { recognitionRuntime, world } = setUp();
    const token = recognitionRuntime.issueCapabilityToken({
      id: 'cap-pmfreak-expired',
      subjectActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      issuerActorId: world.victor.id,
      trustDomainId: world.trustDomainId,
      capability: 'project_closure.client_communication',
      actions: [SEND_CLIENT_FOLLOW_UP_ACTION],
      resourceScopes: [PROJECT_SCOPE],
      approvalRequirement: { actions: [SEND_CLIENT_FOLLOW_UP_ACTION] },
      riskLevel: 'high',
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: world.pmfreak.id,
        passportId: world.pmfreakPassport.id,
        capabilityTokenId: token.id,
        principalActorId: world.victor.id,
        trustDomainId: world.trustDomainId,
        action: SEND_CLIENT_FOLLOW_UP_ACTION,
        resource: PROJECT_SCOPE,
      }),
    );
    assert.equal(decision.type, 'expired');
    assert.equal(decision.approvalRequestId, undefined);
  });

  it('11. out-of-scope capability still returns out_of_scope before approval', () => {
    const { recognitionRuntime, world, fixture } = setUp();
    const decision = recognitionRuntime.submitActionRequest(
      buildSendClientFollowUpActionRequest(recognitionRuntime, world, fixture, {
        id: 'action-request-out-of-scope',
        resource: 'project:GCH-15992',
      }),
    );
    assert.equal(decision.type, 'out_of_scope');
    assert.equal(decision.approvalRequestId, undefined);
  });

  it('12. invalid authority chain still blocks before approval', () => {
    const { recognitionRuntime, world } = setUp();
    const token = recognitionRuntime.issueCapabilityToken({
      id: 'cap-pmfreak-no-authority-chain',
      subjectActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      issuerActorId: world.victor.id,
      trustDomainId: world.trustDomainId,
      capability: 'project_closure.invoicing',
      actions: ['prepare_invoice_support'],
      resourceScopes: [PROJECT_SCOPE],
      approvalRequirement: { actions: ['prepare_invoice_support'] },
      riskLevel: 'high',
    });
    const decision = recognitionRuntime.submitActionRequest(
      recognitionRuntime.buildActionRequest({
        actorId: world.pmfreak.id,
        passportId: world.pmfreakPassport.id,
        capabilityTokenId: token.id,
        principalActorId: world.victor.id,
        trustDomainId: world.trustDomainId,
        action: 'prepare_invoice_support',
        resource: PROJECT_SCOPE,
      }),
    );
    assert.notEqual(decision.type, 'require_human_approval');
    assert.notEqual(decision.type, 'allow');
    assert.equal(decision.approvalRequestId, undefined);
  });

  it('13. existing Recognition Runtime behavior is unchanged when Approval Runtime integration is omitted', () => {
    const recognitionCtx: RuntimeContext = { clock: createManualClock(NOW), idGenerator: createSequentialIdGenerator() };
    const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(NOW));
    const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityRuntime);
    const approvalRuntimeForWorldSetup = new ApprovalRuntime(createApprovalRuntimeContext(NOW), { authorityGraph: authorityRuntime });
    const world = buildDatasysApprovalWorld(recognitionRuntime, authorityRuntime, approvalRuntimeForWorldSetup);
    const fixture = buildPmfreakApprovalFixture(recognitionRuntime, approvalRuntimeForWorldSetup, world);
    authorityRuntime.createDelegationGrant({
      delegatorActorId: world.victor.id,
      delegateActorId: world.pmfreak.id,
      delegateActorType: 'agent',
      trustDomainId: world.trustDomainId,
      sourceAuthorityGrantId: world.victorGrant.id,
      capability: 'project_closure.client_communication',
      actions: [SEND_CLIENT_FOLLOW_UP_ACTION],
      resourceScopes: [PROJECT_SCOPE],
      canRedelegate: false,
    });

    const decision = recognitionRuntime.submitActionRequest(buildSendClientFollowUpActionRequest(recognitionRuntime, world, fixture));
    assert.equal(decision.type, 'require_human_approval');
    assert.equal(decision.approvalRequestId, undefined);
    assert.equal(decision.approvalProofId, undefined);
  });
});
