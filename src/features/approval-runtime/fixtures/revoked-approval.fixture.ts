import type { ApprovalDecisionSubmissionResult } from '../services/approval-decision-service.js';
import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRuntime } from '../runtime/approval-runtime.js';
import { PROJECT_SCOPE, type DatasysApprovalWorld } from './datasys-approval.fixture.js';
import { SEND_CLIENT_FOLLOW_UP_ACTION, type PmfreakApprovalFixture } from './pmfreak-approval.fixture.js';

export function buildRevocableApprovalRequest(
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

/** Drives a request to a fully-approved proof, ready for a test to revoke and confirm it stops counting. */
export function approveRequestToProof(
  approvalRuntime: ApprovalRuntime,
  world: DatasysApprovalWorld,
  request: ApprovalRequest,
): ApprovalDecisionSubmissionResult {
  return approvalRuntime.approve({
    approvalRequestId: request.id,
    approverActorId: world.victor.id,
    evidenceReviewed: [
      {
        id: 'evidence-email-draft-1',
        type: 'email_draft',
        providedByActorId: world.pmfreak.id,
        description: 'Drafted client follow-up email.',
        createdAt: request.createdAt,
      },
    ],
  });
}
