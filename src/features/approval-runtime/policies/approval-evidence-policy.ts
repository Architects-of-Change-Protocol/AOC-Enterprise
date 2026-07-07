import type { ApprovalPolicy, ApprovalPolicyContext, ApprovalPolicyOutcome } from '../domain/approval-policy.js';

const POLICY_ID = 'approval_evidence';

/**
 * An approval decision must include every required evidence type named by
 * the approval requirement. Only applies to 'approved' attempts -- rejecting,
 * escalating or requesting changes does not need the full evidentiary bar.
 */
export class ApprovalEvidencePolicy implements ApprovalPolicy {
  readonly id = POLICY_ID;

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyOutcome {
    const { attempt, request } = context;
    if (attempt.type !== 'approved' || !request) {
      return {
        policyId: POLICY_ID,
        passed: true,
        reasonCode: 'EVIDENCE_NOT_REQUIRED',
        reason: 'Evidence sufficiency is only enforced for approval decisions.',
        severity: 'info',
      };
    }

    const requiredTypes = request.requirement.evidenceRequirements.filter((requirement) => requirement.required).map((requirement) => requirement.type);
    const reviewedTypes = new Set(attempt.evidenceReviewed.map((evidence) => evidence.type));
    const missing = requiredTypes.filter((type) => !reviewedTypes.has(type));

    if (missing.length > 0) {
      return {
        policyId: POLICY_ID,
        passed: false,
        reasonCode: 'APPROVAL_INSUFFICIENT_EVIDENCE',
        reason: `Approval decision is missing required evidence: ${missing.join(', ')}.`,
        severity: 'error',
        decisionType: 'insufficient_evidence',
      };
    }

    return {
      policyId: POLICY_ID,
      passed: true,
      reasonCode: 'APPROVAL_EVIDENCE_SUFFICIENT',
      reason: 'All required evidence was reviewed.',
      severity: 'info',
    };
  }
}
