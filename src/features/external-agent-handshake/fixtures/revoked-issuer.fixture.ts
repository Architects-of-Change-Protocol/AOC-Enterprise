import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { ExternalAgentHandshakeRuntime } from '../runtime/external-agent-handshake-runtime.js';
import { PROJECT_SCOPE, READ_PROJECT_SUMMARY, REVOKED_ISSUER_AGENT_ID, REVOKED_ISSUER_ID, TRUST_DOMAIN_ID } from './datasys-handshake.fixture.js';

export interface SubmitRevokedIssuerHandshakeOptions {
  readonly id?: string;
}

/** Submits a handshake for an agent whose issuer has been revoked -- must always be rejected, regardless of anything else about the request. */
export function submitRevokedIssuerHandshakeRequest(runtime: ExternalAgentHandshakeRuntime, options: SubmitRevokedIssuerHandshakeOptions = {}): HandshakeRequest {
  const handshakeRequestId = options.id ?? 'handshake-request-revoked-issuer-agent';

  const passportPresentation = runtime.presentPassport({
    id: `${handshakeRequestId}-passport`,
    externalAgentId: REVOKED_ISSUER_AGENT_ID,
    externalIssuerId: REVOKED_ISSUER_ID,
    claimedPassportId: 'external-passport-revoked-issuer-agent',
    localTrustDomainId: TRUST_DOMAIN_ID,
    subjectDisplayName: 'Revoked Issuer Agent',
    issuedAt: '2026-01-01T00:00:00.000Z',
    proofHash: 'proof-hash-revoked-issuer-agent',
  });

  const capabilityRequest = runtime.createCapabilityRequest({
    id: `${handshakeRequestId}-capability`,
    externalAgentId: REVOKED_ISSUER_AGENT_ID,
    handshakeRequestId,
    capability: READ_PROJECT_SUMMARY,
    actions: [READ_PROJECT_SUMMARY],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'low',
  });

  const externalAgent = runtime.store.getExternalAgent(REVOKED_ISSUER_AGENT_ID) ?? {
    id: REVOKED_ISSUER_AGENT_ID,
    type: 'agent' as const,
    status: 'known' as const,
    displayName: 'Revoked Issuer Agent',
    externalIssuerId: REVOKED_ISSUER_ID,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
  };

  return runtime.submitHandshakeRequest({
    id: handshakeRequestId,
    localTrustDomainId: TRUST_DOMAIN_ID,
    externalAgent,
    passportPresentation,
    requestedCapabilities: [capabilityRequest],
    requestedActions: [READ_PROJECT_SUMMARY],
    requestedResourceScopes: [PROJECT_SCOPE],
  });
}
