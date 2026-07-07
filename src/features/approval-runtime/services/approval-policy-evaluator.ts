import type { ApprovalDecisionType } from '../domain/approval-decision.js';
import type { ApprovalPolicy, ApprovalPolicyContext } from '../domain/approval-policy.js';
import type { ApprovalPolicyResult } from '../domain/approval-policy.js';

export interface ApprovalPolicyEvaluationResult {
  readonly passed: boolean;
  readonly decisionType: ApprovalDecisionType;
  readonly reasonCode: string;
  readonly reason: string;
  readonly policyResults: readonly ApprovalPolicyResult[];
}

export class ApprovalPolicyEvaluator {
  constructor(private readonly policies: readonly ApprovalPolicy[]) {}

  evaluate(context: ApprovalPolicyContext): ApprovalPolicyEvaluationResult {
    const policyResults: ApprovalPolicyResult[] = [];

    for (const policy of this.policies) {
      const outcome = policy.evaluate(context);
      policyResults.push({
        policyId: outcome.policyId,
        passed: outcome.passed,
        reasonCode: outcome.reasonCode,
        reason: outcome.reason,
        severity: outcome.severity,
        ...(outcome.metadata !== undefined ? { metadata: outcome.metadata } : {}),
      });

      if (!outcome.passed) {
        return {
          passed: false,
          decisionType: outcome.decisionType ?? context.attempt.type,
          reasonCode: outcome.reasonCode,
          reason: outcome.reason,
          policyResults,
        };
      }
    }

    return {
      passed: true,
      decisionType: context.attempt.type,
      reasonCode: 'ALL_APPROVAL_POLICIES_SATISFIED',
      reason: 'All approval policies were satisfied.',
      policyResults,
    };
  }
}
