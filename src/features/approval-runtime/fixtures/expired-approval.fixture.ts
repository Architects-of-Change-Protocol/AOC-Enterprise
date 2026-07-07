import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import type { ApprovalRuntime } from '../runtime/approval-runtime.js';
import { APPROVE_CLIENT_COMMUNICATION, PROJECT_SCOPE, type DatasysApprovalWorld } from './datasys-approval.fixture.js';
import { SEND_CLIENT_FOLLOW_UP_ACTION } from './pmfreak-approval.fixture.js';

/** A requirement that expires one minute after the request is created -- advance the clock past that to test expiry. */
export function buildExpiringApprovalRequirement(approvalRuntime: ApprovalRuntime, world: DatasysApprovalWorld): ApprovalRequirement {
  return approvalRuntime.createApprovalRequirement({
    id: 'approval-requirement-send-client-follow-up-expiring',
    type: 'single_approval',
    trustDomainId: world.trustDomainId,
    action: SEND_CLIENT_FOLLOW_UP_ACTION,
    resourceScope: PROJECT_SCOPE,
    riskLevel: 'high',
    requiredAuthorityCapability: APPROVE_CLIENT_COMMUNICATION,
    minimumApprovals: 1,
    requiresSegregationOfDuties: true,
    evidenceRequirements: [],
    expiresInMinutes: 1,
  });
}

export function buildExpiringApprovalRequest(
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
    resourceScope: PROJECT_SCOPE,
    riskLevel: 'high',
    requirement,
    evidence: [],
  });
}
