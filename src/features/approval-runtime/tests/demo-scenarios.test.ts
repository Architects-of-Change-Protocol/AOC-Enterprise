import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityGraphRuntime } from '../../authority-graph/runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../../authority-graph/runtime/authority-runtime-context.js';
import { createAocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createManualClock, createSequentialIdGenerator, type RuntimeContext } from '../../recognition-runtime/runtime/runtime-context.js';
import { buildDualApprovalRequest, buildDualApprovalRequirement, CLOSE_CRITICAL_MILESTONE_ACTION } from '../fixtures/dual-approval.fixture.js';
import { buildDatasysApprovalWorld, FINANCE_APPROVER_ACTOR_ID, PROJECT_SCOPE, OTHER_PROJECT_SCOPE } from '../fixtures/datasys-approval.fixture.js';
import { buildPmfreakApprovalFixture, buildSendClientFollowUpActionRequest, SEND_CLIENT_FOLLOW_UP_ACTION } from '../fixtures/pmfreak-approval.fixture.js';
import { createApprovalRuntimeContext, createManualApprovalClock, createSequentialApprovalIdGenerator, type ApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { ApprovalRuntime } from '../runtime/approval-runtime.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp() {
  const recognitionClock = createManualClock(NOW);
  const recognitionCtx: RuntimeContext = { clock: recognitionClock, idGenerator: createSequentialIdGenerator() };
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(NOW));
  const approvalClock = createManualApprovalClock(NOW);
  const approvalCtx: ApprovalRuntimeContext = { clock: approvalClock, ids: createSequentialApprovalIdGenerator() };
  const approvalRuntime = new ApprovalRuntime(approvalCtx, { authorityGraph: authorityRuntime });
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
    actions: [SEND_CLIENT_FOLLOW_UP_ACTION],
    resourceScopes: [PROJECT_SCOPE],
    canRedelegate: false,
  });

  return { recognitionClock, approvalClock, recognitionRuntime, authorityRuntime, approvalRuntime, world, fixture };
}

describe('Soberanía Approval Runtime demo scenarios', () => {
  it('1. PMFreak send_client_follow_up -> require_human_approval -> Victor approves -> proof -> Recognition re-evaluation allows', () => {
    const { recognitionRuntime, approvalRuntime, world, fixture } = setUp();
    const actionRequestId = 'demo-action-1';
    const request = buildSendClientFollowUpActionRequest(recognitionRuntime, world, fixture, { id: actionRequestId });

    const firstDecision = recognitionRuntime.submitActionRequest(request);
    assert.equal(firstDecision.type, 'require_human_approval');

    const reference = recognitionRuntime.createApprovalRequestForDecision({
      recognitionDecisionId: firstDecision.id,
      actionRequestId,
      trustDomainId: world.trustDomainId,
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
    });
    assert.ok(reference);

    const submission = approvalRuntime.approve({
      approvalRequestId: reference!.approvalRequestId,
      approverActorId: world.victor.id,
      evidenceReviewed: [{ id: 'evidence-email-draft-1', type: 'email_draft', providedByActorId: world.pmfreak.id, createdAt: NOW }],
    });
    assert.ok(submission.proof);

    const finalDecision = recognitionRuntime.submitActionRequest(request);
    assert.equal(finalDecision.type, 'allow');
    assert.equal(finalDecision.approvalProofId, submission.proof!.id);
  });

  it('2. Unknown External Agent tries to approve -> invalid_approver', () => {
    const { approvalRuntime, world, fixture } = setUp();
    const request = approvalRuntime.createApprovalRequest({
      trustDomainId: world.trustDomainId,
      actionRequestId: 'demo-action-2',
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requirement: fixture.requirement,
      evidence: [],
    });
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: world.unknownAgent.id });
    assert.equal(result.decision.type, 'invalid_approver');
  });

  it('3. Victor approves GCH-15992 with only HMP authority -> out_of_scope', () => {
    const { approvalRuntime, world, fixture } = setUp();
    const outOfScopeRequirement = approvalRuntime.createApprovalRequirement({
      id: 'approval-requirement-demo-out-of-scope',
      type: 'single_approval',
      trustDomainId: world.trustDomainId,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: OTHER_PROJECT_SCOPE,
      riskLevel: 'high',
      requiredAuthorityCapability: 'approve_client_communication',
      minimumApprovals: 1,
      requiresSegregationOfDuties: true,
      evidenceRequirements: fixture.requirement.evidenceRequirements,
    });
    const request = approvalRuntime.createApprovalRequest({
      trustDomainId: world.trustDomainId,
      actionRequestId: 'demo-action-3',
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: OTHER_PROJECT_SCOPE,
      riskLevel: 'high',
      requirement: outOfScopeRequirement,
      evidence: [],
    });
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: world.victor.id });
    assert.equal(result.decision.type, 'out_of_scope');
  });

  it('4. PMFreak Closure Agent tries to approve its own action -> conflict_of_interest', () => {
    const { approvalRuntime, world } = setUp();
    // No requiredAuthorityCapability here -- PMFreak is nominally an allowed approver (via
    // requiredApproverActorIds) so that segregation of duties, not missing authority, is what blocks it.
    const requirement = approvalRuntime.createApprovalRequirement({
      id: 'approval-requirement-demo-self-approval',
      type: 'single_approval',
      trustDomainId: world.trustDomainId,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requiredApproverActorIds: [world.pmfreak.id],
      minimumApprovals: 1,
      requiresSegregationOfDuties: true,
      evidenceRequirements: [],
    });
    const request = approvalRuntime.createApprovalRequest({
      trustDomainId: world.trustDomainId,
      actionRequestId: 'demo-action-4',
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requirement,
      evidence: [],
    });
    approvalRuntime.registerApproverRecognitionStatus(world.pmfreak.id, 'recognized');
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: world.pmfreak.id });
    assert.equal(result.decision.type, 'conflict_of_interest');
  });

  it('5. ApprovalRequest expires before Victor approves -> expired', () => {
    const { approvalRuntime, world, fixture, approvalClock } = setUp();
    const requirement = approvalRuntime.createApprovalRequirement({
      ...fixture.requirement,
      id: 'approval-requirement-demo-expiring',
      expiresInMinutes: 1,
    });
    const request = approvalRuntime.createApprovalRequest({
      trustDomainId: world.trustDomainId,
      actionRequestId: 'demo-action-5',
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requirement,
      evidence: [],
    });
    approvalClock.advance(2 * 60_000);
    const result = approvalRuntime.approve({
      approvalRequestId: request.id,
      approverActorId: world.victor.id,
      evidenceReviewed: [{ id: 'evidence-email-draft-1', type: 'email_draft', providedByActorId: world.pmfreak.id, createdAt: NOW }],
    });
    assert.equal(result.decision.type, 'expired');
    assert.equal(result.decision.reasonCode, 'APPROVAL_EXPIRED');
  });

  it('6. critical action requires PM + Finance: Victor alone insufficient, Victor + Finance passes', () => {
    const { approvalRuntime, world } = setUp();
    const requirement = buildDualApprovalRequirement(approvalRuntime, world);
    const request = buildDualApprovalRequest(approvalRuntime, world, requirement, 'demo-action-6');

    const victorOnly = approvalRuntime.approve({
      approvalRequestId: request.id,
      approverActorId: world.victor.id,
      evidenceReviewed: [{ id: 'evidence-project-context-1', type: 'project_context', providedByActorId: world.pmfreak.id, createdAt: NOW }],
    });
    assert.equal(victorOnly.decision.type, 'approved');
    assert.equal(victorOnly.quorumMet, false);
    assert.equal(victorOnly.request?.status, 'pending');

    const withFinance = approvalRuntime.approve({
      approvalRequestId: request.id,
      approverActorId: FINANCE_APPROVER_ACTOR_ID,
      evidenceReviewed: [{ id: 'evidence-project-context-2', type: 'project_context', providedByActorId: world.pmfreak.id, createdAt: NOW }],
    });
    assert.equal(withFinance.quorumMet, true);
    assert.equal(withFinance.request?.status, 'approved');
    assert.ok(withFinance.proof);
    assert.equal(withFinance.proof?.action, CLOSE_CRITICAL_MILESTONE_ACTION);
  });

  it('7. ApprovalProof is revoked before reuse -> Recognition re-evaluation does not allow the action', () => {
    const { recognitionRuntime, approvalRuntime, world, fixture } = setUp();
    const actionRequestId = 'demo-action-7';
    const request = buildSendClientFollowUpActionRequest(recognitionRuntime, world, fixture, { id: actionRequestId });
    const firstDecision = recognitionRuntime.submitActionRequest(request);
    const reference = recognitionRuntime.createApprovalRequestForDecision({
      recognitionDecisionId: firstDecision.id,
      actionRequestId,
      trustDomainId: world.trustDomainId,
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
    });
    assert.ok(reference);
    const submission = approvalRuntime.approve({
      approvalRequestId: reference!.approvalRequestId,
      approverActorId: world.victor.id,
      evidenceReviewed: [{ id: 'evidence-email-draft-1', type: 'email_draft', providedByActorId: world.pmfreak.id, createdAt: NOW }],
    });
    assert.ok(submission.proof);

    approvalRuntime.revokeApproval({ approvalProofId: submission.proof!.id, revokedByActorId: world.datasys.id, reason: 'Compliance hold.' });

    const finalDecision = recognitionRuntime.submitActionRequest(request);
    assert.notEqual(finalDecision.type, 'allow');
  });

  it('8. approval does not override revoked capability -> Recognition returns revoked before approval evaluation', () => {
    const { recognitionRuntime, world } = setUp();
    const token = recognitionRuntime.issueCapabilityToken({
      id: 'cap-demo-revoked',
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
});
