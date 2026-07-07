import type { HandshakeDecisionResult } from '../services/handshake-decision-service.js';
import type { ExternalAgentHandshakeRuntime } from '../runtime/external-agent-handshake-runtime.js';
import { submitTrustedPartnerHandshakeRequest, type SubmitTrustedPartnerHandshakeOptions } from './known-partner-agent.fixture.js';

/**
 * Accepts a Trusted Partner Research Agent handshake with a deliberately
 * short visa TTL, so a test can advance the injected clock past `expiresAt`
 * and exercise visa-expiration verification without waiting on a full policy
 * re-evaluation.
 */
export function acceptTrustedPartnerHandshakeWithShortVisa(
  runtime: ExternalAgentHandshakeRuntime,
  ttlMinutes = 1,
  options: SubmitTrustedPartnerHandshakeOptions = {},
): HandshakeDecisionResult {
  const request = submitTrustedPartnerHandshakeRequest(runtime, options);
  return runtime.decisionService.accept(request.id, 'DEMO_ACCEPTED', 'Accepted for visa expiration/revocation testing.', { ttlMinutes });
}
