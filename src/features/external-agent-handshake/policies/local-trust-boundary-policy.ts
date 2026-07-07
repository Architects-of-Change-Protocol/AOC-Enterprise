import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * The local trust boundary is the final authority: no external claim
 * (passport, authority, approval, prior visa) may ever override it. Runs
 * first so every downstream policy can assume a boundary exists and is
 * active.
 */
export class LocalTrustBoundaryPolicy implements HandshakePolicy {
  readonly id = 'local_trust_boundary';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const boundary = context.trustBoundary;
    if (!boundary) {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'TRUST_BOUNDARY_MISSING',
        reason: `No trust boundary is configured for trust domain "${context.request.localTrustDomainId}".`,
        severity: 'critical',
      };
    }
    if (boundary.status === 'revoked') {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'TRUST_BOUNDARY_REVOKED',
        reason: `Trust boundary ${boundary.id} has been revoked.`,
        severity: 'critical',
      };
    }
    if (boundary.status === 'suspended') {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'TRUST_BOUNDARY_SUSPENDED',
        reason: `Trust boundary ${boundary.id} is suspended.`,
        severity: 'critical',
      };
    }
    return {
      policyId: this.id,
      passed: true,
      reasonCode: 'TRUST_BOUNDARY_ACTIVE',
      reason: `Trust boundary ${boundary.id} is active.`,
      severity: 'info',
    };
  }
}
