import type { GuardActionRequestInput } from '../sdk/aoc-guard.js';
import type { DatasysEnforcementFixture } from './datasys-enforcement.fixture.js';
import { PMFREAK_ACTOR_ID, PMFREAK_COMMUNICATION_TOKEN_ID, PROJECT_SCOPE, SEND_CLIENT_FOLLOW_UP, TRUST_DOMAIN_ID, VICTOR_ACTOR_ID } from './datasys-enforcement.fixture.js';

/**
 * PMFreak Closure Agent attempting to send a client follow-up before Victor
 * has approved it. Recognition Runtime returns require_human_approval, so
 * enforcement must return approval_required and never invoke the executor.
 */
export function buildSendClientFollowUpGuardInput(overrides: Partial<GuardActionRequestInput> = {}): GuardActionRequestInput {
  return {
    actorId: PMFREAK_ACTOR_ID,
    principalActorId: VICTOR_ACTOR_ID,
    trustDomainId: TRUST_DOMAIN_ID,
    action: SEND_CLIENT_FOLLOW_UP,
    resourceScope: PROJECT_SCOPE,
    capability: 'project_closure.client_communication',
    sideEffectType: 'send_message',
    riskLevel: 'high',
    metadata: { passportId: 'passport-pmfreak', capabilityTokenId: PMFREAK_COMMUNICATION_TOKEN_ID },
    ...overrides,
  };
}

/**
 * Runs Approval Runtime's own create-request-for-decision -> approve flow
 * for a prior send_client_follow_up preflight, mirroring Approval Runtime's
 * own demo scenario. Returns the resulting approvalProofId so a follow-up
 * enforcement request can present it and be allowed.
 */
export function approveSendClientFollowUp(fixture: DatasysEnforcementFixture, recognitionDecisionId: string, actionRequestId: string): string {
  const reference = fixture.recognitionRuntime.createApprovalRequestForDecision({
    recognitionDecisionId,
    actionRequestId,
    trustDomainId: TRUST_DOMAIN_ID,
    requestedByActorId: PMFREAK_ACTOR_ID,
    targetActorId: PMFREAK_ACTOR_ID,
    principalActorId: VICTOR_ACTOR_ID,
    action: SEND_CLIENT_FOLLOW_UP,
    resourceScope: PROJECT_SCOPE,
    riskLevel: 'high',
  });
  if (!reference) {
    throw new Error('Expected Approval Runtime to create an approval request for this decision.');
  }
  const submission = fixture.approvalRuntime.approve({
    approvalRequestId: reference.approvalRequestId,
    approverActorId: VICTOR_ACTOR_ID,
    evidenceReviewed: [],
  });
  if (!submission.proof) {
    throw new Error('Expected Victor\'s approval to produce an ApprovalProof.');
  }
  return submission.proof.id;
}
