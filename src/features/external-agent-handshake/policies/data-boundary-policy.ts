import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * Requested data domains must be allowed to flow outbound to the external
 * agent under the local trust boundary's data-boundary rules. An external
 * agent can never receive data outside what those rules allow, regardless of
 * how trusted its issuer or how broad its capability grant.
 */
export class DataBoundaryPolicy implements HandshakePolicy {
  readonly id = 'data_boundary';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const requestedDataDomains = context.request.requestedDataDomains;
    if (!requestedDataDomains || requestedDataDomains.length === 0) {
      return { policyId: this.id, passed: true, reasonCode: 'DATA_BOUNDARY_NOT_APPLICABLE', reason: 'No data domains were requested.', severity: 'info' };
    }

    const boundary = context.trustBoundary;
    if (!boundary || boundary.dataBoundaries.length === 0) {
      return { policyId: this.id, passed: true, reasonCode: 'DATA_BOUNDARY_UNRESTRICTED', reason: 'No data boundary rules are configured.', severity: 'info' };
    }

    const denied = requestedDataDomains.filter(
      (domain) =>
        !boundary.dataBoundaries.some((rule) => {
          if (rule.prohibitedDataDomains.includes(domain)) {
            return false;
          }
          if (!rule.allowedDirections.includes('outbound') && !rule.allowedDirections.includes('bidirectional')) {
            return false;
          }
          return rule.allowedDataDomains.length === 0 || rule.allowedDataDomains.includes(domain);
        }),
    );

    if (denied.length > 0) {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'DATA_BOUNDARY_DENIED',
        reason: `Requested data domain(s) [${denied.join(', ')}] are outside the local data boundary.`,
        severity: 'critical',
      };
    }

    return { policyId: this.id, passed: true, reasonCode: 'DATA_BOUNDARY_ALLOWED', reason: 'All requested data domains are within the local data boundary.', severity: 'info' };
  }
}
