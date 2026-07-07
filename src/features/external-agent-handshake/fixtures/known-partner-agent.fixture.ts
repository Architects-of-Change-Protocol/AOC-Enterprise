import type { ExternalCapabilityRiskLevel } from '../domain/external-capability-request.js';
import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { ExternalAgentHandshakeRuntime } from '../runtime/external-agent-handshake-runtime.js';
import { PROJECT_SCOPE, READ_PROJECT_SUMMARY, TRUSTED_PARTNER_AGENT_ID, TRUSTED_PARTNER_ISSUER_ID, TRUST_DOMAIN_ID } from './datasys-handshake.fixture.js';

export interface SubmitTrustedPartnerHandshakeOptions {
  readonly id?: string;
  readonly capability?: string;
  readonly actions?: readonly string[];
  readonly resourceScope?: string;
  readonly riskLevel?: ExternalCapabilityRiskLevel;
}

/**
 * Submits a well-formed handshake for the Trusted Partner Research Agent --
 * the "known good" agent every other scenario is contrasted against. Requires
 * buildDatasysHandshakeWorld to have already registered the issuer/agent/trust
 * boundary.
 */
export function submitTrustedPartnerHandshakeRequest(runtime: ExternalAgentHandshakeRuntime, options: SubmitTrustedPartnerHandshakeOptions = {}): HandshakeRequest {
  const handshakeRequestId = options.id ?? 'handshake-request-trusted-partner-research-agent';
  const capability = options.capability ?? READ_PROJECT_SUMMARY;
  const actions = options.actions ?? [READ_PROJECT_SUMMARY];
  const resourceScope = options.resourceScope ?? PROJECT_SCOPE;

  const passportPresentation = runtime.presentPassport({
    id: `${handshakeRequestId}-passport`,
    externalAgentId: TRUSTED_PARTNER_AGENT_ID,
    externalIssuerId: TRUSTED_PARTNER_ISSUER_ID,
    claimedPassportId: 'external-passport-trusted-partner-research-agent',
    localTrustDomainId: TRUST_DOMAIN_ID,
    subjectDisplayName: 'Trusted Partner Research Agent',
    issuedAt: '2026-01-01T00:00:00.000Z',
    proofHash: 'proof-hash-trusted-partner-research-agent',
  });

  const capabilityRequest = runtime.createCapabilityRequest({
    id: `${handshakeRequestId}-capability`,
    externalAgentId: TRUSTED_PARTNER_AGENT_ID,
    handshakeRequestId,
    capability,
    actions,
    resourceScopes: [resourceScope],
    riskLevel: options.riskLevel ?? 'low',
    dataDomains: ['project_status'],
  });

  const externalAgent = runtime.store.getExternalAgent(TRUSTED_PARTNER_AGENT_ID) ?? {
    id: TRUSTED_PARTNER_AGENT_ID,
    type: 'agent' as const,
    status: 'known' as const,
    displayName: 'Trusted Partner Research Agent',
    externalIssuerId: TRUSTED_PARTNER_ISSUER_ID,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
  };

  return runtime.submitHandshakeRequest({
    id: handshakeRequestId,
    localTrustDomainId: TRUST_DOMAIN_ID,
    externalAgent,
    passportPresentation,
    requestedCapabilities: [capabilityRequest],
    requestedActions: actions,
    requestedResourceScopes: [resourceScope],
    requestedDataDomains: ['project_status'],
    expiresInMinutes: 120,
  });
}
