import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { ExternalAgentHandshakeRuntime } from '../runtime/external-agent-handshake-runtime.js';
import { APPROVE_PAYMENT_ACTION, PROJECT_SCOPE, READ_PROJECT_SUMMARY, UNKNOWN_AGENT_ID, TRUST_DOMAIN_ID } from './datasys-handshake.fixture.js';

export interface SubmitUnknownAgentHandshakeOptions {
  readonly id?: string;
  readonly capability?: string;
  readonly actions?: readonly string[];
  readonly resourceScope?: string;
}

/**
 * Submits a handshake for the Unknown External Agent -- no registered
 * external issuer at all. Used both for the "unknown issuer requires
 * approval" scenario (requesting an otherwise-allowed capability) and the
 * "unknown agent attempts a prohibited action" scenario.
 */
export function submitUnknownAgentHandshakeRequest(runtime: ExternalAgentHandshakeRuntime, options: SubmitUnknownAgentHandshakeOptions = {}): HandshakeRequest {
  const handshakeRequestId = options.id ?? 'handshake-request-unknown-external-agent';
  const capability = options.capability ?? READ_PROJECT_SUMMARY;
  const actions = options.actions ?? [capability];
  const resourceScope = options.resourceScope ?? PROJECT_SCOPE;

  const passportPresentation = runtime.presentPassport({
    id: `${handshakeRequestId}-passport`,
    externalAgentId: UNKNOWN_AGENT_ID,
    claimedPassportId: 'external-passport-unknown-external-agent',
    localTrustDomainId: TRUST_DOMAIN_ID,
    subjectDisplayName: 'Unknown External Agent',
    issuedAt: '2026-01-01T00:00:00.000Z',
  });

  const capabilityRequest = runtime.createCapabilityRequest({
    id: `${handshakeRequestId}-capability`,
    externalAgentId: UNKNOWN_AGENT_ID,
    handshakeRequestId,
    capability,
    actions,
    resourceScopes: [resourceScope],
    riskLevel: capability === APPROVE_PAYMENT_ACTION ? 'critical' : 'medium',
  });

  const externalAgent = runtime.store.getExternalAgent(UNKNOWN_AGENT_ID) ?? {
    id: UNKNOWN_AGENT_ID,
    type: 'agent' as const,
    status: 'unknown' as const,
    displayName: 'Unknown External Agent',
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
    expiresInMinutes: 30,
  });
}
