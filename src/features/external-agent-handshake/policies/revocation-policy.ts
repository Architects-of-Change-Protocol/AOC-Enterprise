import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * Revocation always wins. Defense-in-depth check: even though
 * TrustedIssuerPolicy already rejects a revoked issuer earlier in the chain,
 * this policy re-confirms neither the request itself nor its issuer has been
 * revoked since evaluation began.
 */
export class RevocationPolicy implements HandshakePolicy {
  readonly id = 'revocation';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    if (context.request.status === 'revoked') {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'revoked',
        reasonCode: 'HANDSHAKE_REVOKED',
        reason: `Handshake request ${context.request.id} has been revoked.`,
        severity: 'critical',
      };
    }
    if (context.issuer?.status === 'revoked') {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'ISSUER_REVOKED',
        reason: `External issuer ${context.issuer.id} has been revoked.`,
        severity: 'critical',
      };
    }
    return { policyId: this.id, passed: true, reasonCode: 'NOT_REVOKED', reason: 'Neither the request nor its issuer has been revoked.', severity: 'info' };
  }
}
