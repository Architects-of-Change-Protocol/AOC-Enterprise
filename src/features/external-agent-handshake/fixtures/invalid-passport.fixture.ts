import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { ExternalAgentHandshakeRuntime } from '../runtime/external-agent-handshake-runtime.js';
import { EXPIRED_PASSPORT_AGENT_ID, PROJECT_SCOPE, READ_PROJECT_SUMMARY, TRUSTED_PARTNER_ISSUER_ID, TRUST_DOMAIN_ID } from './datasys-handshake.fixture.js';

export interface SubmitExpiredPassportHandshakeOptions {
  readonly id?: string;
  readonly expiresAt?: string;
}

/**
 * Submits a handshake for an otherwise-legitimate Trusted Partner Org agent
 * whose presented passport already expired -- must be rejected regardless of
 * how trusted the issuer is.
 */
export function submitExpiredPassportHandshakeRequest(runtime: ExternalAgentHandshakeRuntime, options: SubmitExpiredPassportHandshakeOptions = {}): HandshakeRequest {
  const handshakeRequestId = options.id ?? 'handshake-request-expired-passport-agent';

  const passportPresentation = runtime.presentPassport({
    id: `${handshakeRequestId}-passport`,
    externalAgentId: EXPIRED_PASSPORT_AGENT_ID,
    externalIssuerId: TRUSTED_PARTNER_ISSUER_ID,
    claimedPassportId: 'external-passport-expired-passport-agent',
    localTrustDomainId: TRUST_DOMAIN_ID,
    subjectDisplayName: 'Expired Passport Agent',
    issuedAt: '2025-01-01T00:00:00.000Z',
    expiresAt: options.expiresAt ?? '2025-06-01T00:00:00.000Z',
    proofHash: 'proof-hash-expired-passport-agent',
  });

  const capabilityRequest = runtime.createCapabilityRequest({
    id: `${handshakeRequestId}-capability`,
    externalAgentId: EXPIRED_PASSPORT_AGENT_ID,
    handshakeRequestId,
    capability: READ_PROJECT_SUMMARY,
    actions: [READ_PROJECT_SUMMARY],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'low',
  });

  const externalAgent = runtime.store.getExternalAgent(EXPIRED_PASSPORT_AGENT_ID) ?? {
    id: EXPIRED_PASSPORT_AGENT_ID,
    type: 'agent' as const,
    status: 'known' as const,
    displayName: 'Expired Passport Agent',
    externalIssuerId: TRUSTED_PARTNER_ISSUER_ID,
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
