import type { ActionRequest } from '../domain/action-request.js';
import type { AocRecognitionRuntime } from '../runtime/aoc-recognition-runtime.js';
import { buildDatasysCapabilityTokens, PROJECT_SCOPE, OUT_OF_SCOPE_RESOURCE, type DatasysCapabilityTokens } from './capability-tokens.fixture.js';
import { buildDatasysAgentRepublicWorld, type DatasysAgentRepublicWorld } from './datasys-agent-republic.fixture.js';
import { closureEmailEvidence } from './evidence.fixture.js';

export interface RecognizedAgentScenario {
  readonly world: DatasysAgentRepublicWorld;
  readonly tokens: DatasysCapabilityTokens;
  draftClosureEmailRequest(): ActionRequest;
  sendFinalInvoiceRequest(): ActionRequest;
  sendClientFollowUpRequest(): ActionRequest;
  outOfScopeDraftRequest(): ActionRequest;
  missingEvidenceDraftRequest(): ActionRequest;
  expiredTokenDraftRequest(): ActionRequest;
  revokedTokenDraftRequest(): ActionRequest;
  delegatedDraftMeetingNotesRequest(): ActionRequest;
  forgedRedelegationRequest(): ActionRequest;
}

export function buildRecognizedAgentScenario(runtime: AocRecognitionRuntime): RecognizedAgentScenario {
  const world = buildDatasysAgentRepublicWorld(runtime);
  const tokens = buildDatasysCapabilityTokens(runtime, world);

  const pmfreakBase = {
    actorId: world.pmfreak.id,
    passportId: world.pmfreakPassport.id,
    trustDomainId: world.trustDomain.id,
  };

  return {
    world,
    tokens,
    draftClosureEmailRequest: () =>
      runtime.buildActionRequest({
        ...pmfreakBase,
        capabilityTokenId: tokens.pmfreakDraftingToken.id,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
        evidence: closureEmailEvidence,
      }),
    sendFinalInvoiceRequest: () =>
      runtime.buildActionRequest({
        ...pmfreakBase,
        capabilityTokenId: tokens.pmfreakDraftingToken.id,
        action: 'send_final_invoice',
        resource: PROJECT_SCOPE,
        evidence: closureEmailEvidence,
      }),
    sendClientFollowUpRequest: () =>
      runtime.buildActionRequest({
        ...pmfreakBase,
        capabilityTokenId: tokens.pmfreakFollowUpApprovalToken.id,
        action: 'send_client_follow_up',
        resource: PROJECT_SCOPE,
      }),
    outOfScopeDraftRequest: () =>
      runtime.buildActionRequest({
        ...pmfreakBase,
        capabilityTokenId: tokens.pmfreakDraftingToken.id,
        action: 'draft_closure_email',
        resource: OUT_OF_SCOPE_RESOURCE,
        evidence: closureEmailEvidence,
      }),
    missingEvidenceDraftRequest: () =>
      runtime.buildActionRequest({
        ...pmfreakBase,
        capabilityTokenId: tokens.pmfreakDraftingToken.id,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
      }),
    expiredTokenDraftRequest: () =>
      runtime.buildActionRequest({
        ...pmfreakBase,
        capabilityTokenId: tokens.pmfreakExpiredToken.id,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
        evidence: closureEmailEvidence,
      }),
    revokedTokenDraftRequest: () =>
      runtime.buildActionRequest({
        ...pmfreakBase,
        capabilityTokenId: tokens.pmfreakRevokedToken.id,
        action: 'draft_closure_email',
        resource: PROJECT_SCOPE,
        evidence: closureEmailEvidence,
      }),
    delegatedDraftMeetingNotesRequest: () =>
      runtime.buildActionRequest({
        ...pmfreakBase,
        capabilityTokenId: tokens.pmfreakDelegatedDraftingToken.id,
        action: 'draft_meeting_notes',
        resource: PROJECT_SCOPE,
      }),
    forgedRedelegationRequest: () =>
      runtime.buildActionRequest({
        ...pmfreakBase,
        capabilityTokenId: tokens.forgedRedelegatedToken.id,
        action: 'draft_meeting_notes',
        resource: PROJECT_SCOPE,
      }),
  };
}
