import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * An external issuer must be known and accepted by the local trust domain
 * unless boundary policy explicitly allows unknown issuers through an
 * approval path. Revoked/suspended issuers are always denied. A limited
 * issuer narrows the requested capability/scope set down to what it is
 * itself allowed to vouch for.
 */
export class TrustedIssuerPolicy implements HandshakePolicy {
  readonly id = 'trusted_issuer';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const issuer = context.issuer;
    const boundary = context.trustBoundary;
    const requiresApprovalForUnknown = boundary?.requiresApprovalForUnknownIssuers === true;

    if (!issuer || issuer.status === 'unknown') {
      if (requiresApprovalForUnknown) {
        return {
          policyId: this.id,
          passed: true,
          requiresApproval: true,
          reasonCode: 'ISSUER_UNKNOWN_REQUIRES_APPROVAL',
          reason: 'The external issuer is unknown to this trust domain; human approval is required before proceeding.',
          severity: 'warning',
        };
      }
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'ISSUER_UNTRUSTED',
        reason: 'The external issuer is unknown to this trust domain and unknown issuers are not accepted.',
        severity: 'critical',
      };
    }

    if (issuer.status === 'revoked') {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'ISSUER_REVOKED',
        reason: `External issuer ${issuer.id} has been revoked.`,
        severity: 'critical',
      };
    }

    if (issuer.status === 'suspended') {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'ISSUER_SUSPENDED',
        reason: `External issuer ${issuer.id} is suspended.`,
        severity: 'critical',
      };
    }

    if (issuer.allowedAgentTypes.length > 0 && !issuer.allowedAgentTypes.includes(context.request.externalAgent.type)) {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'ISSUER_UNTRUSTED',
        reason: `External issuer ${issuer.id} does not vouch for agent type "${context.request.externalAgent.type}".`,
        severity: 'critical',
      };
    }

    if (issuer.status === 'limited') {
      const allowedCapabilities = context.allowedCapabilities.filter(
        (capability) => issuer.allowedCapabilities.length === 0 || issuer.allowedCapabilities.includes(capability),
      );
      const allowedResourceScopes = context.allowedResourceScopes.filter(
        (scope) => issuer.allowedResourceScopes.length === 0 || issuer.allowedResourceScopes.includes(scope),
      );
      return {
        policyId: this.id,
        passed: true,
        allowedCapabilities,
        allowedResourceScopes,
        reasonCode: 'ISSUER_LIMITED',
        reason: `External issuer ${issuer.id} is limited; requested capabilities/scopes were narrowed to what it may vouch for.`,
        severity: 'warning',
      };
    }

    return {
      policyId: this.id,
      passed: true,
      reasonCode: 'ISSUER_TRUSTED',
      reason: `External issuer ${issuer.id} is trusted.`,
      severity: 'info',
    };
  }
}
