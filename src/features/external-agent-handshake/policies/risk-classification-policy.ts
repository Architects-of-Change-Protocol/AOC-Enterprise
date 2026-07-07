import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

/**
 * Classifies the aggregate risk of a handshake request. Low/medium risk
 * proceeds untouched. High risk requires human approval when the boundary
 * calls for it; critical risk always requires approval, and if the boundary
 * offers no approval path for high risk at all, critical risk is rejected
 * outright rather than silently allowed.
 */
export class RiskClassificationPolicy implements HandshakePolicy {
  readonly id = 'risk_classification';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    const approvalPathAvailable = context.trustBoundary?.requiresApprovalForHighRisk === true;

    if (context.riskLevel === 'critical') {
      if (!approvalPathAvailable) {
        return {
          policyId: this.id,
          passed: false,
          decisionType: 'rejected',
          reasonCode: 'RISK_TOO_HIGH',
          reason: 'This request is classified as critical risk and no approval path is configured for it.',
          severity: 'critical',
        };
      }
      return {
        policyId: this.id,
        passed: true,
        requiresApproval: true,
        reasonCode: 'RISK_REQUIRES_APPROVAL',
        reason: 'This request is classified as critical risk and requires human approval.',
        severity: 'warning',
      };
    }

    if (context.riskLevel === 'high' && approvalPathAvailable) {
      return {
        policyId: this.id,
        passed: true,
        requiresApproval: true,
        reasonCode: 'RISK_REQUIRES_APPROVAL',
        reason: 'This request is classified as high risk and requires human approval.',
        severity: 'warning',
      };
    }

    return { policyId: this.id, passed: true, reasonCode: 'RISK_ACCEPTABLE', reason: `Risk level "${context.riskLevel}" does not require additional approval.`, severity: 'info' };
  }
}
