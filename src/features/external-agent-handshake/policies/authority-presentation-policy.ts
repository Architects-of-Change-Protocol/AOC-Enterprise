import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

const HIGH_RISK_LEVELS = new Set(['high', 'critical']);

/**
 * High/critical-risk requests must present valid authority for their claimed
 * capability. Missing authority either hard-rejects or -- when the boundary
 * allows it -- routes to human approval instead. Authority found valid here
 * can never expand beyond what the local trust boundary separately allows.
 */
export class AuthorityPresentationPolicy implements HandshakePolicy {
  readonly id = 'authority_presentation';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const requiresAuthority = HIGH_RISK_LEVELS.has(context.riskLevel);
    const presentation = context.request.authorityPresentation;
    const check = context.authorityCheck;

    if (!presentation) {
      if (!requiresAuthority) {
        return { policyId: this.id, passed: true, reasonCode: 'AUTHORITY_NOT_REQUIRED', reason: 'No authority presentation was required for this request.', severity: 'info' };
      }
      if (context.trustBoundary?.requiresApprovalForHighRisk === true) {
        return {
          policyId: this.id,
          passed: true,
          requiresApproval: true,
          reasonCode: 'AUTHORITY_MISSING',
          reason: 'No authority presentation was provided for a high-risk request; human approval is required.',
          severity: 'warning',
        };
      }
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'AUTHORITY_MISSING',
        reason: 'No authority presentation was provided for a high-risk request.',
        severity: 'critical',
      };
    }

    if (check?.type === 'ancestor_expired' || presentation.status === 'expired') {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'AUTHORITY_EXPIRED',
        reason: `Authority presentation ${presentation.id} has expired.`,
        severity: 'critical',
      };
    }
    if (check?.type === 'ancestor_revoked' || presentation.status === 'revoked') {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'AUTHORITY_REVOKED',
        reason: `Authority presentation ${presentation.id} was revoked.`,
        severity: 'critical',
      };
    }
    if (check?.type === 'scope_expansion_detected' || presentation.status === 'insufficient_scope') {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: 'AUTHORITY_SCOPE_DENIED',
        reason: `Authority presentation ${presentation.id} claims more than the local trust boundary allows.`,
        severity: 'critical',
      };
    }
    if (presentation.status === 'valid' || check?.valid === true) {
      return { policyId: this.id, passed: true, reasonCode: 'AUTHORITY_VALID', reason: `Authority presentation ${presentation.id} is valid.`, severity: 'info' };
    }

    return {
      policyId: this.id,
      passed: false,
      decisionType: 'rejected',
      reasonCode: 'AUTHORITY_INVALID',
      reason: `Authority presentation ${presentation.id} is invalid.`,
      severity: 'critical',
    };
  }
}
