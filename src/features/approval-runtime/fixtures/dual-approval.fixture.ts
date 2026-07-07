import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import type { ApprovalRuntime } from '../runtime/approval-runtime.js';
import { APPROVE_CRITICAL_ACTION, PROJECT_SCOPE, type DatasysApprovalWorld } from './datasys-approval.fixture.js';

export const CLOSE_CRITICAL_MILESTONE_ACTION = 'close_critical_project_milestone';

/**
 * A critical action that requires two distinct approvals -- Victor (Project
 * Manager) and the Finance Approver both hold approve_critical_action
 * authority over project:HMP-14665, so either alone is a valid but
 * insufficient approver; together they satisfy quorum.
 */
export function buildDualApprovalRequirement(approvalRuntime: ApprovalRuntime, world: DatasysApprovalWorld): ApprovalRequirement {
  return approvalRuntime.createApprovalRequirement({
    id: 'approval-requirement-close-critical-milestone',
    type: 'dual_approval',
    trustDomainId: world.trustDomainId,
    action: CLOSE_CRITICAL_MILESTONE_ACTION,
    resourceScope: PROJECT_SCOPE,
    riskLevel: 'critical',
    requiredAuthorityCapability: APPROVE_CRITICAL_ACTION,
    minimumApprovals: 2,
    requiresSegregationOfDuties: true,
    evidenceRequirements: [
      { id: 'evidence-requirement-project-context', type: 'project_context', required: true, description: 'Project closure context.' },
    ],
  });
}

export function buildDualApprovalRequest(
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
    action: CLOSE_CRITICAL_MILESTONE_ACTION,
    resourceScope: PROJECT_SCOPE,
    riskLevel: 'critical',
    requirement,
    evidence: [],
  });
}
