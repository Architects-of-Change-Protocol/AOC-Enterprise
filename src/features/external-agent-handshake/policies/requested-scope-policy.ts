import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * Narrows requested resource scopes down to what the local trust boundary
 * allows. Scopes the boundary explicitly prohibits are always denied; scopes
 * outside an (non-empty) allow-list are denied by omission.
 */
export class RequestedScopePolicy implements HandshakePolicy {
  readonly id = 'requested_scope';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const boundary = context.trustBoundary;
    if (!boundary) {
      return { policyId: this.id, passed: true, reasonCode: 'SCOPE_BOUNDARY_UNAVAILABLE', reason: 'No trust boundary to evaluate scope against.', severity: 'info' };
    }

    const allowedResourceScopes = context.allowedResourceScopes.filter((scope) => {
      if (boundary.prohibitedResourceScopes.includes(scope)) {
        return false;
      }
      return boundary.allowedResourceScopes.length === 0 || boundary.allowedResourceScopes.includes(scope);
    });

    if (allowedResourceScopes.length === 0) {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'SCOPE_DENIED',
        reason: 'None of the requested resource scopes are permitted by the local trust boundary.',
        severity: 'critical',
      };
    }

    if (allowedResourceScopes.length < context.allowedResourceScopes.length) {
      return {
        policyId: this.id,
        passed: true,
        allowedResourceScopes,
        reasonCode: 'SCOPE_LIMITED',
        reason: 'Requested resource scopes were narrowed to what the local trust boundary permits.',
        severity: 'warning',
      };
    }

    return { policyId: this.id, passed: true, reasonCode: 'SCOPE_ALLOWED', reason: 'All requested resource scopes are permitted.', severity: 'info' };
  }
}
