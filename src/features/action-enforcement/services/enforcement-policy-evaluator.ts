import type { EnforcementDecisionType } from '../domain/enforcement-decision.js';
import type { EnforcementPolicy, EnforcementPolicyContext, EnforcementPolicyResult } from '../domain/enforcement-verification.js';
import { createDefaultEnforcementPolicyChain } from '../policies/index.js';

export interface EnforcementPolicyEvaluationResult {
  readonly decisionType: EnforcementDecisionType;
  readonly reasonCode: string;
  readonly reason: string;
  readonly policyResults: readonly EnforcementPolicyResult[];
}

/**
 * Evaluates the fixed, ordered enforcement policy chain and stops at the
 * first failure -- mirrors Recognition Runtime's PolicyEvaluator. Every
 * policy that ran (passed or failed) is recorded, in order, in
 * `policyResults`, so results are deterministic and reproducible for the
 * same input every time.
 */
export class EnforcementPolicyEvaluator {
  private readonly policies: readonly EnforcementPolicy[];

  constructor(policies: readonly EnforcementPolicy[] = createDefaultEnforcementPolicyChain()) {
    this.policies = policies;
  }

  evaluate(context: EnforcementPolicyContext): EnforcementPolicyEvaluationResult {
    const policyResults: EnforcementPolicyResult[] = [];
    let overrideDecisionType: EnforcementDecisionType | undefined;
    let overrideReasonCode: string | undefined;
    let overrideReason: string | undefined;

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

      if (outcome.decisionType !== undefined) {
        overrideDecisionType = outcome.decisionType;
        overrideReasonCode = outcome.reasonCode;
        overrideReason = outcome.reason;
      }

      if (!outcome.passed) {
        return {
          decisionType: outcome.decisionType ?? 'execution_blocked',
          reasonCode: outcome.reasonCode,
          reason: outcome.reason,
          policyResults,
        };
      }
    }

    return {
      decisionType: overrideDecisionType ?? 'execute_allowed',
      reasonCode: overrideReasonCode ?? 'ALL_POLICIES_SATISFIED',
      reason: overrideReason ?? 'All enforcement policies were satisfied.',
      policyResults,
    };
  }
}
