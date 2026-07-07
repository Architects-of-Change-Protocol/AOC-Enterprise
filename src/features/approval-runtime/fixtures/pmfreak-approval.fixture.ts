import type { ActionRequest } from '../../recognition-runtime/domain/action-request.js';
import type { RecognitionCapabilityToken } from '../../recognition-runtime/domain/capability-token.js';
import type { AocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import type { ApprovalRuntime } from '../runtime/approval-runtime.js';
import { APPROVE_CLIENT_COMMUNICATION, PROJECT_SCOPE, TRUST_DOMAIN_ID, type DatasysApprovalWorld } from './datasys-approval.fixture.js';

export const SEND_CLIENT_FOLLOW_UP_ACTION = 'send_client_follow_up';

export interface PmfreakApprovalFixture {
  readonly pmfreakToken: RecognitionCapabilityToken;
  readonly requirement: ApprovalRequirement;
}

/**
 * PMFreak Closure Agent holds a capability token for send_client_follow_up
 * that Recognition Runtime flags as requiring human approval. Approval
 * Runtime's matching requirement says Victor (holding
 * approve_client_communication authority over project:HMP-14665) must
 * approve, with segregation of duties enforced so PMFreak cannot approve its
 * own request.
 */
export function buildPmfreakApprovalFixture(
  recognitionRuntime: AocRecognitionRuntime,
  approvalRuntime: ApprovalRuntime,
  world: DatasysApprovalWorld,
): PmfreakApprovalFixture {
  const pmfreakToken = recognitionRuntime.issueCapabilityToken({
    id: 'cap-pmfreak-client-communication',
    subjectActorId: world.pmfreak.id,
    principalActorId: world.victor.id,
    issuerActorId: world.victor.id,
    trustDomainId: world.trustDomainId,
    capability: 'project_closure.client_communication',
    actions: [SEND_CLIENT_FOLLOW_UP_ACTION],
    resourceScopes: [PROJECT_SCOPE],
    approvalRequirement: { actions: [SEND_CLIENT_FOLLOW_UP_ACTION], requiredApproverActorIds: [world.victor.id] },
    riskLevel: 'high',
  });

  const requirement = approvalRuntime.createApprovalRequirement({
    id: 'approval-requirement-send-client-follow-up',
    type: 'single_approval',
    trustDomainId: TRUST_DOMAIN_ID,
    action: SEND_CLIENT_FOLLOW_UP_ACTION,
    resourceScope: PROJECT_SCOPE,
    riskLevel: 'high',
    requiredAuthorityCapability: APPROVE_CLIENT_COMMUNICATION,
    minimumApprovals: 1,
    requiresSegregationOfDuties: true,
    evidenceRequirements: [
      { id: 'evidence-requirement-email-draft', type: 'email_draft', required: true, description: 'Drafted client follow-up email.' },
    ],
  });

  return { pmfreakToken, requirement };
}

export function buildSendClientFollowUpActionRequest(
  recognitionRuntime: AocRecognitionRuntime,
  world: DatasysApprovalWorld,
  fixture: PmfreakApprovalFixture,
  overrides: Partial<ActionRequest> = {},
): ActionRequest {
  return recognitionRuntime.buildActionRequest({
    actorId: world.pmfreak.id,
    passportId: world.pmfreakPassport.id,
    capabilityTokenId: fixture.pmfreakToken.id,
    principalActorId: world.victor.id,
    trustDomainId: world.trustDomainId,
    action: SEND_CLIENT_FOLLOW_UP_ACTION,
    resource: PROJECT_SCOPE,
    ...overrides,
  });
}
