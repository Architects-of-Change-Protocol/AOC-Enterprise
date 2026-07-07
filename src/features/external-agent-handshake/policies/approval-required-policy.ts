import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyOutcome } from '../domain/handshake-policy.js';

const HARD_BLOCKING_APPROVAL_TYPES = new Set([
  'approval_invalid',
  'approval_revoked',
  'invalid_approver',
  'approval_out_of_scope',
  'segregation_of_duties_violation',
]);

/**
 * Resolves whatever approval requirement earlier policies (trusted-issuer,
 * authority-presentation, risk-classification) flagged. Absent a valid
 * ApprovalProof, the handshake stays pending on requires_approval. A valid
 * approval clears the requirement; a hard-blocking approval outcome (revoked,
 * invalid, out-of-scope, segregation-of-duties) rejects outright. Approval
 * can never override an explicit local trust-boundary denial -- this policy
 * only ever resolves a *pending* approval requirement, never grants access
 * the boundary itself prohibited.
 */
export class ApprovalRequiredPolicy implements HandshakePolicy {
  readonly id = 'approval_required';

  evaluate(context: HandshakePolicyContext): HandshakePolicyOutcome {
    if (!context.requiresApprovalSoFar) {
      return { policyId: this.id, passed: true, reasonCode: 'APPROVAL_NOT_REQUIRED', reason: 'No approval requirement is pending.', severity: 'info' };
    }

    const check = context.approvalCheck;
    if (!check) {
      return {
        policyId: this.id,
        passed: true,
        requiresApproval: true,
        reasonCode: 'APPROVAL_REQUIRED',
        reason: 'This handshake requires human approval and none has been recorded yet.',
        severity: 'warning',
      };
    }

    if (check.valid && check.type === 'approval_valid') {
      return {
        policyId: this.id,
        passed: true,
        requiresApproval: false,
        reasonCode: 'APPROVAL_VALID',
        reason: 'A valid approval satisfies the pending approval requirement.',
        severity: 'info',
      };
    }

    if (HARD_BLOCKING_APPROVAL_TYPES.has(check.type)) {
      return {
        policyId: this.id,
        passed: false,
        decisionType: 'rejected',
        reasonCode: check.reasonCode,
        reason: check.reason,
        severity: 'critical',
      };
    }

    return {
      policyId: this.id,
      passed: true,
      requiresApproval: true,
      reasonCode: check.reasonCode,
      reason: check.reason,
      severity: 'warning',
    };
  }
}
