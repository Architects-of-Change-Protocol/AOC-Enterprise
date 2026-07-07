import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import type { ApprovalRuntime } from '../runtime/approval-runtime.js';
import { APPROVE_CLIENT_COMMUNICATION, OTHER_PROJECT_SCOPE, PROJECT_SCOPE, type DatasysApprovalWorld } from './datasys-approval.fixture.js';
import { SEND_CLIENT_FOLLOW_UP_ACTION, type PmfreakApprovalFixture } from './pmfreak-approval.fixture.js';

/**
 * A standard, valid ApprovalRequest for PMFreak's send_client_follow_up
 * action, ready to be attacked by invalid approval attempts: an unrecognized
 * actor, an out-of-scope approver, or a self-approving requester.
 */
export function buildStandardApprovalRequest(
  approvalRuntime: ApprovalRuntime,
  world: DatasysApprovalWorld,
  fixture: PmfreakApprovalFixture,
  actionRequestId: string,
): ApprovalRequest {
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

/** A requirement for the same action but scoped to a project Victor holds no authority over. */
export function buildOutOfScopeApprovalRequirement(approvalRuntime: ApprovalRuntime, world: DatasysApprovalWorld): ApprovalRequirement {
  return approvalRuntime.createApprovalRequirement({
    id: 'approval-requirement-send-client-follow-up-other-scope',
    type: 'single_approval',
    trustDomainId: world.trustDomainId,
    action: SEND_CLIENT_FOLLOW_UP_ACTION,
    resourceScope: OTHER_PROJECT_SCOPE,
    riskLevel: 'high',
    requiredAuthorityCapability: APPROVE_CLIENT_COMMUNICATION,
    minimumApprovals: 1,
    requiresSegregationOfDuties: true,
    evidenceRequirements: [],
  });
}

export function buildOutOfScopeApprovalRequest(
  approvalRuntime: ApprovalRuntime,
  world: DatasysApprovalWorld,
  requirement: ApprovalRequirement,
  actionRequestId: string,
): ApprovalRequest {
  return approvalRuntime.createApprovalRequest({
    trustDomainId: world.trustDomainId,
    actionRequestId,
    requestedByActorId: world.pmfreak.id,
    targetActorId: world.pmfreak.id,
    principalActorId: world.victor.id,
    action: SEND_CLIENT_FOLLOW_UP_ACTION,
    resourceScope: OTHER_PROJECT_SCOPE,
    riskLevel: 'high',
    requirement,
    evidence: [],
  });
}
