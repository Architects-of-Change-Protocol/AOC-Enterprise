import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityGraphRuntime } from '../../authority-graph/runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../../authority-graph/runtime/authority-runtime-context.js';
import { createAocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createRuntimeContext } from '../../recognition-runtime/runtime/runtime-context.js';
import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import {
  APPROVE_CLIENT_COMMUNICATION,
  APPROVE_FINANCIAL_ACTION,
  FINANCE_SCOPE,
  FINANCE_APPROVER_ACTOR_ID,
  PROJECT_SCOPE,
  buildDatasysApprovalWorld,
} from '../fixtures/datasys-approval.fixture.js';
import { SEND_CLIENT_FOLLOW_UP_ACTION, buildPmfreakApprovalFixture } from '../fixtures/pmfreak-approval.fixture.js';
import { createApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import { ApprovalRuntime } from '../runtime/approval-runtime.js';

const NOW = '2026-01-01T00:00:00.000Z';
const FINANCE_ACTION = 'approve_invoice_payment';

function setUp() {
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(NOW));
  const approvalRuntime = new ApprovalRuntime(createApprovalRuntimeContext(NOW), { authorityGraph: authorityRuntime });
  const recognitionRuntime = createAocRecognitionRuntime(createRuntimeContext(NOW), undefined, authorityRuntime);
  const world = buildDatasysApprovalWorld(recognitionRuntime, authorityRuntime, approvalRuntime);
  const fixture = buildPmfreakApprovalFixture(recognitionRuntime, approvalRuntime, world);

  const financeRequirement: ApprovalRequirement = approvalRuntime.createApprovalRequirement({
    id: 'approval-requirement-finance-invoice',
    type: 'single_approval',
    trustDomainId: world.trustDomainId,
    action: FINANCE_ACTION,
    resourceScope: FINANCE_SCOPE,
    riskLevel: 'critical',
    requiredAuthorityCapability: APPROVE_FINANCIAL_ACTION,
    minimumApprovals: 1,
    requiresSegregationOfDuties: false,
    evidenceRequirements: [],
  });

  function createFollowUpRequest(actionRequestId: string) {
    return approvalRuntime.createApprovalRequest({
      trustDomainId: world.trustDomainId,
      actionRequestId,
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requirement: fixture.requirement,
      evidence: [],
    });
  }

  function createFinanceRequest(actionRequestId: string) {
    return approvalRuntime.createApprovalRequest({
      trustDomainId: world.trustDomainId,
      actionRequestId,
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: FINANCE_ACTION,
      resourceScope: FINANCE_SCOPE,
      riskLevel: 'critical',
      requirement: financeRequirement,
      evidence: [],
    });
  }

  return { authorityRuntime, approvalRuntime, recognitionRuntime, world, fixture, financeRequirement, createFollowUpRequest, createFinanceRequest };
}

describe('Approval Runtime + Authority Graph integration', () => {
  it('1. Victor can approve because Authority Graph validates his PM authority', () => {
    const { approvalRuntime, createFollowUpRequest } = setUp();
    const request = createFollowUpRequest('action-request-1');
    const result = approvalRuntime.approve({
      approvalRequestId: request.id,
      approverActorId: 'actor-victor-valverde',
      evidenceReviewed: [{ id: 'evidence-1', type: 'email_draft', providedByActorId: 'actor-pmfreak-closure-agent', createdAt: NOW }],
    });
    assert.equal(result.decision.type, 'approved');
    assert.ok(result.decision.authorityDecisionId);
  });

  it('2. Unknown External Agent cannot approve because no authority chain exists', () => {
    const { approvalRuntime, createFollowUpRequest } = setUp();
    const request = createFollowUpRequest('action-request-2');
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: 'actor-unknown-external-agent' });
    assert.notEqual(result.decision.type, 'approved');
  });

  it('3. Victor cannot approve out-of-scope project', () => {
    const { approvalRuntime, world, fixture } = setUp();
    const outOfScopeRequirement = approvalRuntime.createApprovalRequirement({
      id: 'approval-requirement-out-of-scope',
      type: 'single_approval',
      trustDomainId: world.trustDomainId,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: 'project:GCH-15992',
      riskLevel: 'high',
      requiredAuthorityCapability: APPROVE_CLIENT_COMMUNICATION,
      minimumApprovals: 1,
      requiresSegregationOfDuties: true,
      evidenceRequirements: fixture.requirement.evidenceRequirements,
    });
    const request = approvalRuntime.createApprovalRequest({
      trustDomainId: world.trustDomainId,
      actionRequestId: 'action-request-3',
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      principalActorId: world.victor.id,
      action: SEND_CLIENT_FOLLOW_UP_ACTION,
      resourceScope: 'project:GCH-15992',
      riskLevel: 'high',
      requirement: outOfScopeRequirement,
      evidence: [],
    });
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: world.victor.id });
    assert.equal(result.decision.type, 'out_of_scope');
  });

  it('4. Finance approver can approve finance-critical action', () => {
    const { approvalRuntime, createFinanceRequest } = setUp();
    const request = createFinanceRequest('action-request-4');
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: FINANCE_APPROVER_ACTOR_ID });
    assert.equal(result.decision.type, 'approved');
    assert.equal(result.quorumMet, true);
  });

  it('5. PM alone cannot approve finance-critical action requiring Finance', () => {
    const { approvalRuntime, world, createFinanceRequest } = setUp();
    const request = createFinanceRequest('action-request-5');
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: world.victor.id });
    assert.notEqual(result.decision.type, 'approved');
  });

  it('6. revoked Victor authority invalidates future approvals', () => {
    const { approvalRuntime, authorityRuntime, world, createFollowUpRequest } = setUp();
    authorityRuntime.revokeAuthorityGrant(world.victorGrant.id, world.datasys.id, "Datasys revoked Victor's authority.");
    const request = createFollowUpRequest('action-request-6');
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: world.victor.id });
    assert.equal(result.decision.type, 'revoked');
  });

  it('7. expired Victor authority invalidates future approvals', () => {
    const { approvalRuntime, authorityRuntime, world } = setUp();
    // A fresh, distinct capability (not present on the base victorGrant) so authority resolution
    // matches only this expiring grant, rather than ambiguously matching two grants for the same action.
    authorityRuntime.issueAuthorityGrant({
      id: 'authority-grant-victor-expiring',
      issuerActorId: world.datasys.id,
      subjectActorId: world.victor.id,
      trustDomainId: world.trustDomainId,
      capability: 'project_closure.time_limited_approval',
      actions: ['approve_time_limited_action'],
      resourceScopes: [PROJECT_SCOPE],
      canDelegate: false,
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    const requirement = approvalRuntime.createApprovalRequirement({
      id: 'approval-requirement-time-limited',
      type: 'single_approval',
      trustDomainId: world.trustDomainId,
      action: 'time_limited_action',
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requiredAuthorityCapability: 'approve_time_limited_action',
      minimumApprovals: 1,
      requiresSegregationOfDuties: true,
      evidenceRequirements: [],
    });
    const request = approvalRuntime.createApprovalRequest({
      trustDomainId: world.trustDomainId,
      actionRequestId: 'action-request-7',
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      action: 'time_limited_action',
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requirement,
      evidence: [],
    });
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: world.victor.id });
    assert.equal(result.decision.type, 'expired');
  });

  it('8. ApprovalProof includes AuthorityProof for approver', () => {
    const { approvalRuntime, createFollowUpRequest } = setUp();
    const request = createFollowUpRequest('action-request-8');
    const result = approvalRuntime.approve({
      approvalRequestId: request.id,
      approverActorId: 'actor-victor-valverde',
      evidenceReviewed: [{ id: 'evidence-1', type: 'email_draft', providedByActorId: 'actor-pmfreak-closure-agent', createdAt: NOW }],
    });
    assert.ok(result.proof);
    assert.ok(result.proof?.authorityProofId);
  });

  it('9. approval fails if Authority Graph returns ancestor_revoked', () => {
    const { approvalRuntime, authorityRuntime, world, createFollowUpRequest } = setUp();
    authorityRuntime.revokeAuthorityGrant(world.victorGrant.id, world.datasys.id, 'Revoked for compliance.');
    const request = createFollowUpRequest('action-request-9');
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: world.victor.id });
    assert.equal(result.decision.approved, false);
    assert.equal(result.decision.type, 'revoked');
  });

  it('10. approval fails if Authority Graph returns ancestor_expired', () => {
    const { approvalRuntime, authorityRuntime, world } = setUp();
    authorityRuntime.issueAuthorityGrant({
      id: 'authority-grant-victor-expiring-2',
      issuerActorId: world.datasys.id,
      subjectActorId: world.victor.id,
      trustDomainId: world.trustDomainId,
      capability: 'project_closure.time_limited_approval',
      actions: ['approve_time_limited_action_2'],
      resourceScopes: [PROJECT_SCOPE],
      canDelegate: false,
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    const requirement = approvalRuntime.createApprovalRequirement({
      id: 'approval-requirement-time-limited-2',
      type: 'single_approval',
      trustDomainId: world.trustDomainId,
      action: 'time_limited_action_2',
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requiredAuthorityCapability: 'approve_time_limited_action_2',
      minimumApprovals: 1,
      requiresSegregationOfDuties: true,
      evidenceRequirements: [],
    });
    const request = approvalRuntime.createApprovalRequest({
      trustDomainId: world.trustDomainId,
      actionRequestId: 'action-request-10',
      requestedByActorId: world.pmfreak.id,
      targetActorId: world.pmfreak.id,
      action: 'time_limited_action_2',
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requirement,
      evidence: [],
    });
    const result = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: world.victor.id });
    assert.equal(result.decision.approved, false);
    assert.equal(result.decision.type, 'expired');
  });
});
