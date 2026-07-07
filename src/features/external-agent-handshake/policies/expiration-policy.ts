import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * A HandshakeRequest that has already passed its own expiry can never be
 * accepted, no matter what the rest of the evaluation concluded. Uses the
 * injected clock only.
 */
export class ExpirationPolicy implements HandshakePolicy {
  readonly id = 'expiration';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const { expiresAt } = context.request;
    if (expiresAt !== undefined && Date.parse(context.now) >= Date.parse(expiresAt)) {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'expired',
        reasonCode: 'HANDSHAKE_EXPIRED',
        reason: `Handshake request ${context.request.id} expired at ${expiresAt}.`,
        severity: 'critical',
      };
    }
    return { policyId: this.id, passed: true, reasonCode: 'HANDSHAKE_NOT_EXPIRED', reason: 'Handshake request has not expired.', severity: 'info' };
  }
}
