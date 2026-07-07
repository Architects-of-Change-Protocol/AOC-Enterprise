import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * When a control-proof challenge was issued for this handshake, it must have
 * been answered correctly before acceptance. A handshake that never issued a
 * challenge is unaffected -- the challenge is opt-in per request.
 */
export class ChallengeResponsePolicy implements HandshakePolicy {
  readonly id = 'challenge_response';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const challenge = context.challenge;
    if (!challenge) {
      return { policyId: this.id, passed: true, reasonCode: 'CHALLENGE_NOT_REQUIRED', reason: 'No challenge was issued for this handshake.', severity: 'info' };
    }

    switch (challenge.status) {
      case 'valid':
        return { policyId: this.id, passed: true, reasonCode: 'CHALLENGE_VALID', reason: `Challenge ${challenge.id} was answered correctly.`, severity: 'info' };
      case 'expired':
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'rejected',
          reasonCode: 'CHALLENGE_EXPIRED',
          reason: `Challenge ${challenge.id} expired before it was answered.`,
          severity: 'critical',
        };
      case 'issued':
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'rejected',
          reasonCode: 'CHALLENGE_MISSING',
          reason: `Challenge ${challenge.id} has not been answered yet.`,
          severity: 'critical',
        };
      default:
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'rejected',
          reasonCode: 'CHALLENGE_INVALID',
          reason: `Challenge ${challenge.id} response is invalid or was revoked.`,
          severity: 'critical',
        };
    }
  }
}
