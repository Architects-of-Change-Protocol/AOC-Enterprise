import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { ExternalAgentHandshakeRuntime } from '../runtime/external-agent-handshake-runtime.js';
import { LIMITED_PARTNER_AGENT_ID, LIMITED_PARTNER_ISSUER_ID, PROJECT_SCOPE, SUBMIT_PROJECT_UPDATE, TRUST_DOMAIN_ID } from './datasys-handshake.fixture.js';

export interface SubmitApprovalRequiredHandshakeOptions {
  readonly id?: string;
}

/**
 * Submits a high-risk handshake for the Limited Partner Reporting Agent --
 * an otherwise-legitimate, known-issuer request that is deliberately flagged
 * high risk, so it must be routed through requires_approval rather than
 * accepted outright.
 */
export function submitApprovalRequiredHandshakeRequest(runtime: ExternalAgentHandshakeRuntime, options: SubmitApprovalRequiredHandshakeOptions = {}): HandshakeRequest {
  const handshakeRequestId = options.id ?? 'handshake-request-limited-partner-high-risk';

  const passportPresentation = runtime.presentPassport({
    id: `${handshakeRequestId}-passport`,
    externalAgentId: LIMITED_PARTNER_AGENT_ID,
    externalIssuerId: LIMITED_PARTNER_ISSUER_ID,
    claimedPassportId: 'external-passport-limited-partner-reporting-agent',
    localTrustDomainId: TRUST_DOMAIN_ID,
    subjectDisplayName: 'Limited Partner Reporting Agent',
    issuedAt: '2026-01-01T00:00:00.000Z',
    proofHash: 'proof-hash-limited-partner-reporting-agent',
  });

  const capabilityRequest = runtime.createCapabilityRequest({
    id: `${handshakeRequestId}-capability`,
    externalAgentId: LIMITED_PARTNER_AGENT_ID,
    handshakeRequestId,
    capability: SUBMIT_PROJECT_UPDATE,
    actions: [SUBMIT_PROJECT_UPDATE],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'high',
  });

  const externalAgent = runtime.store.getExternalAgent(LIMITED_PARTNER_AGENT_ID) ?? {
    id: LIMITED_PARTNER_AGENT_ID,
    type: 'agent' as const,
    status: 'known' as const,
    displayName: 'Limited Partner Reporting Agent',
    externalIssuerId: LIMITED_PARTNER_ISSUER_ID,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
  };

  return runtime.submitHandshakeRequest({
    id: handshakeRequestId,
    localTrustDomainId: TRUST_DOMAIN_ID,
    externalAgent,
    passportPresentation,
    requestedCapabilities: [capabilityRequest],
    requestedActions: [SUBMIT_PROJECT_UPDATE],
    requestedResourceScopes: [PROJECT_SCOPE],
  });
}
