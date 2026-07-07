import type { ApprovalPolicy, ApprovalPolicyContext, ApprovalPolicyOutcome } from '../domain/approval-policy.js';

const POLICY_ID = 'approver_authority';

/**
 * When the approval requirement names a required authority capability
 * (approve_project_action, approve_client_communication,
 * approve_financial_action, approve_critical_action, ...), the approver must
 * hold that authority per Authority Graph. Scope mismatches are left to
 * ApprovalScopePolicy; this policy only covers authority being entirely
 * missing, revoked or expired.
 */
export class ApproverAuthorityPolicy implements ApprovalPolicy {
  readonly id = POLICY_ID;

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome {
    const requiredCapability = context.request?.requirement.requiredAuthorityCapability;
    if (requiredCapability === undefined) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'AUTHORITY_NOT_REQUIRED',
        reason: 'This approval requirement does not name a required authority capability.',
        severity: 'info',
      };
    }

    const { authorityCheck } = context;
    if (!authorityCheck) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'APPROVER_AUTHORITY_MISSING',
        reason: `Approver authority for capability "${requiredCapability}" could not be verified: no Authority Graph integration is configured.`,
        severity: 'critical',
        decisionType: 'invalid_approver',
      };
    }

    if (authorityCheck.type === 'scope_expansion_detected') {
      // Out-of-scope authority is a distinct failure mode; ApprovalScopePolicy owns that reasonCode.
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'APPROVER_AUTHORITY_PRESENT',
        reason: `Approver holds authority for capability "${requiredCapability}"; scope is evaluated separately.`,
        severity: 'info',
      };
    }

    if (!authorityCheck.valid) {
      const decisionType = authorityCheck.type === 'ancestor_revoked' ? 'revoked' : authorityCheck.type === 'ancestor_expired' ? 'expired' : 'invalid_approver';
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'APPROVER_AUTHORITY_MISSING',
        reason: authorityCheck.reason,
        severity: 'critical',
        decisionType,
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'APPROVER_AUTHORITY_PRESENT',
      reason: `Approver holds valid authority for capability "${requiredCapability}".`,
      severity: 'info',
    };
  }
}
