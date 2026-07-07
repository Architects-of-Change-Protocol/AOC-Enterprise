import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * Narrows requested capabilities/actions down to what the local trust
 * boundary allows. Capabilities/actions the boundary explicitly prohibits are
 * always denied outright, regardless of issuer trust or authority.
 */
export class RequestedCapabilityPolicy implements HandshakePolicy {
  readonly id = 'requested_capability';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const boundary = context.trustBoundary;
    if (!boundary) {
      return { policyId: this.id, passed: true, reasonCode: 'CAPABILITY_BOUNDARY_UNAVAILABLE', reason: 'No trust boundary to evaluate capabilities against.', severity: 'info' };
    }

    const allowedCapabilities = context.allowedCapabilities.filter((capability) => {
      if (boundary.prohibitedCapabilities.includes(capability)) {
        return false;
      }
      return boundary.allowedCapabilities.length === 0 || boundary.allowedCapabilities.includes(capability);
    });
    const allowedActions = context.allowedActions.filter((action) => !boundary.prohibitedActions.includes(action));

    if (allowedCapabilities.length === 0 || allowedActions.length === 0) {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'CAPABILITY_DENIED',
        reason: 'None of the requested capabilities/actions are permitted by the local trust boundary.',
        severity: 'critical',
      };
    }

    const limited = allowedCapabilities.length < context.allowedCapabilities.length || allowedActions.length < context.allowedActions.length;
    if (limited) {
      return {
        policyId: this.id,
        passed: true,
        allowedCapabilities,
        allowedActions,
        reasonCode: 'CAPABILITY_LIMITED',
        reason: 'Requested capabilities/actions were narrowed to what the local trust boundary permits.',
        severity: 'warning',
      };
    }

    return { policyId: this.id, passed: true, reasonCode: 'CAPABILITY_ALLOWED', reason: 'All requested capabilities/actions are permitted.', severity: 'info' };
  }
}
