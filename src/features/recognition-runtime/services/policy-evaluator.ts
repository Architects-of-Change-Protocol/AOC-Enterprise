import type { ActionRequest } from '../domain/action-request.js';
import type { Policy, PolicyContext } from '../domain/policy.js';
import type { PolicyResult, RecognitionDecisionType, RiskLevel } from '../domain/index.js';

export interface PolicyEvaluationResult {
  readonly decisionType: RecognitionDecisionType;
  readonly reasonCode: string;
  readonly reason: string;
  readonly policyResults: readonly PolicyResult[];
  readonly riskLevel?: RiskLevel;
  readonly requiredEvidence?: readonly string[];
  readonly requiredApproverActorIds?: readonly string[];
}

export class PolicyEvaluator {
  constructor(private readonly policies: readonly Policy[]) {}

  evaluatePolicies(request: ActionRequest, context: PolicyContext): PolicyEvaluationResult {
    const policyResults: PolicyResult[] = [];

    for (const policy of this.policies) {
      const outcome = policy.evaluate(request, context);
      policyResults.push({
        policyId: outcome.policyId,
        passed: outcome.passed,
        reasonCode: outcome.reasonCode,
        reason: outcome.reason,
      });

      if (!outcome.passed) {
        return {
          decisionType: outcome.decisionType ?? 'deny',
          reasonCode: outcome.reasonCode,
          reason: outcome.reason,
          policyResults,
          ...(outcome.riskLevel !== undefined ? { riskLevel: outcome.riskLevel } : {}),
          ...(outcome.requiredEvidence !== undefined ? { requiredEvidence: outcome.requiredEvidence } : {}),
          ...(outcome.requiredApproverActorIds !== undefined ? { requiredApproverActorIds: outcome.requiredApproverActorIds } : {}),
        };
      }
    }

    return {
      decisionType: 'allow',
      reasonCode: 'ALL_POLICIES_SATISFIED',
      reason: 'All recognition policies were satisfied.',
      policyResults,
      ...(context.capabilityToken?.riskLevel !== undefined ? { riskLevel: context.capabilityToken.riskLevel } : {}),
    };
  }
}
