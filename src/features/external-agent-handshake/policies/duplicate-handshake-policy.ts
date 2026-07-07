import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * Guards against issuing a second, redundant visa for the exact same
 * external agent/scope while an active handshake already covers it.
 * HandshakeRequestService already makes plain resubmission idempotent; this
 * is the last-line check for a distinct HandshakeRequest object that still
 * targets identical access.
 */
export class DuplicateHandshakePolicy implements HandshakePolicy {
  readonly id = 'duplicate_handshake';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const duplicate = context.duplicateActiveRequest;
    if (!duplicate) {
      return { policyId: this.id, passed: true, reasonCode: 'NO_DUPLICATE_HANDSHAKE', reason: 'No duplicate active handshake was found.', severity: 'info' };
    }
    return {
      policyId: this.id,
      passed: false,
      decisionType: 'rejected',
      reasonCode: 'DUPLICATE_HANDSHAKE',
      reason: `An active handshake (${duplicate.id}) already covers this external agent's access for this trust domain.`,
      severity: 'critical',
    };
  }
}
