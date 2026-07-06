import type { RecognitionCapabilityToken } from '../domain/capability-token.js';
import type { AocRecognitionRuntime } from '../runtime/aoc-recognition-runtime.js';
import type { DatasysAgentRepublicWorld } from './datasys-agent-republic.fixture.js';

export const PROJECT_SCOPE = 'project:HMP-14665';
export const OUT_OF_SCOPE_RESOURCE = 'project:OTHER-99999';

const TOKEN_EXPIRY = '2027-01-01T00:00:00.000Z';
const EXPIRED_TOKEN_EXPIRY = '2025-01-01T00:00:00.000Z';

export interface DatasysCapabilityTokens {
  readonly pmfreakDraftingToken: RecognitionCapabilityToken;
  readonly pmfreakFollowUpApprovalToken: RecognitionCapabilityToken;
  readonly pmfreakExpiredToken: RecognitionCapabilityToken;
  readonly pmfreakRevokedToken: RecognitionCapabilityToken;
  readonly victorDraftingToken: RecognitionCapabilityToken;
  readonly pmfreakDelegatedDraftingToken: RecognitionCapabilityToken;
  readonly forgedRedelegatedToken: RecognitionCapabilityToken;
}

export function buildDatasysCapabilityTokens(
  runtime: AocRecognitionRuntime,
  world: DatasysAgentRepublicWorld,
): DatasysCapabilityTokens {
  const { trustDomain, datasys, victor, pmfreak } = world;

  const pmfreakDraftingToken = runtime.issueCapabilityToken({
    id: 'cap-pmfreak-drafting',
    subjectActorId: pmfreak.id,
    principalActorId: datasys.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    capability: 'project_closure.drafting',
    actions: ['draft_closure_email', 'summarize_project_status', 'prepare_invoice_support'],
    resourceScopes: [PROJECT_SCOPE],
    prohibitedActions: ['send_final_invoice', 'approve_payment', 'sign_contract'],
    evidenceRequirements: [{ action: 'draft_closure_email', requiredEvidenceTypes: ['email_thread', 'project_context'] }],
    riskLevel: 'medium',
    expiresAt: TOKEN_EXPIRY,
  });

  const pmfreakFollowUpApprovalToken = runtime.issueCapabilityToken({
    id: 'cap-pmfreak-follow-up-approval',
    subjectActorId: pmfreak.id,
    principalActorId: datasys.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    capability: 'project_closure.client_communication',
    actions: ['send_client_follow_up'],
    resourceScopes: [PROJECT_SCOPE],
    approvalRequirement: { actions: ['send_client_follow_up'], requiredApproverActorIds: [victor.id] },
    riskLevel: 'high',
    expiresAt: TOKEN_EXPIRY,
  });

  const pmfreakExpiredToken = runtime.issueCapabilityToken({
    id: 'cap-pmfreak-expired',
    subjectActorId: pmfreak.id,
    principalActorId: datasys.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    capability: 'project_closure.drafting',
    actions: ['draft_closure_email'],
    resourceScopes: [PROJECT_SCOPE],
    evidenceRequirements: [{ action: 'draft_closure_email', requiredEvidenceTypes: ['email_thread', 'project_context'] }],
    riskLevel: 'medium',
    expiresAt: EXPIRED_TOKEN_EXPIRY,
  });

  const pmfreakRevokedToken = runtime.issueCapabilityToken({
    id: 'cap-pmfreak-revoked',
    subjectActorId: pmfreak.id,
    principalActorId: datasys.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    capability: 'project_closure.drafting',
    actions: ['draft_closure_email'],
    resourceScopes: [PROJECT_SCOPE],
    evidenceRequirements: [{ action: 'draft_closure_email', requiredEvidenceTypes: ['email_thread', 'project_context'] }],
    riskLevel: 'medium',
    expiresAt: TOKEN_EXPIRY,
  });
  runtime.revokeCapabilityToken(pmfreakRevokedToken.id, trustDomain.id);

  const victorDraftingToken = runtime.issueCapabilityToken({
    id: 'cap-victor-drafting',
    subjectActorId: victor.id,
    principalActorId: victor.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    capability: 'project_closure.drafting',
    actions: ['draft_meeting_notes'],
    resourceScopes: [PROJECT_SCOPE],
    delegable: true,
    maxDelegationDepth: 1,
    riskLevel: 'low',
    expiresAt: TOKEN_EXPIRY,
  });

  const pmfreakDelegatedDraftingToken = runtime.issueCapabilityToken({
    id: 'cap-pmfreak-delegated-drafting',
    subjectActorId: pmfreak.id,
    principalActorId: victor.id,
    issuerActorId: victor.id,
    trustDomainId: trustDomain.id,
    capability: 'project_closure.drafting',
    actions: ['draft_meeting_notes'],
    resourceScopes: [PROJECT_SCOPE],
    delegatedFromTokenId: victorDraftingToken.id,
    delegable: false,
    riskLevel: 'low',
    expiresAt: TOKEN_EXPIRY,
  });

  // Simulates PMFreak forging a further redelegation beyond what Victor granted it.
  const forgedRedelegatedToken: RecognitionCapabilityToken = {
    ...pmfreakDelegatedDraftingToken,
    id: 'cap-forged-redelegated',
    principalActorId: pmfreak.id,
    issuerActorId: pmfreak.id,
    delegation: {
      delegable: pmfreakDelegatedDraftingToken.delegation.delegable,
      delegatedFromTokenId: pmfreakDelegatedDraftingToken.id,
      delegationDepth: pmfreakDelegatedDraftingToken.delegation.delegationDepth + 1,
      maxDelegationDepth: pmfreakDelegatedDraftingToken.delegation.maxDelegationDepth,
    },
  };
  runtime.capabilityTokenService.importCapabilityToken(forgedRedelegatedToken);

  return {
    pmfreakDraftingToken,
    pmfreakFollowUpApprovalToken,
    pmfreakExpiredToken,
    pmfreakRevokedToken,
    victorDraftingToken,
    pmfreakDelegatedDraftingToken,
    forgedRedelegatedToken,
  };
}
