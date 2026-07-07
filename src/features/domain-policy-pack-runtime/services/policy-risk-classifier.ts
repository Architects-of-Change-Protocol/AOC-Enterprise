import { POLICY_RISK_ORDER, type PolicyRiskClassificationResult } from '../domain/policy-pack-risk.js';
import type { PolicyRiskLevel } from '../domain/policy-pack-effect.js';
import type { PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';

/**
 * Computes the effective risk level from the input risk and any matched
 * rule riskOverride effects. Risk is never lowered below the input's own
 * risk level -- policy packs may only raise risk, never quietly reduce it.
 */
export class PolicyRiskClassifier {
  classify(inputRiskLevel: PolicyRiskLevel, ruleResults: readonly PolicyRuleEvaluationResult[]): PolicyRiskClassificationResult {
    let effective = inputRiskLevel;
    const raisedByRuleIds: string[] = [];

    for (const result of ruleResults) {
      if (!result.matched || result.effectType !== 'raise_risk') {
        continue;
      }
      const candidate = result.riskOverride ?? this.nextLevel(effective);
      if (this.rank(candidate) > this.rank(effective)) {
        effective = candidate;
        raisedByRuleIds.push(result.ruleId);
      }
    }

    return { inputRiskLevel, effectiveRiskLevel: effective, raisedByRuleIds };
  }

  private rank(level: PolicyRiskLevel): number {
    return POLICY_RISK_ORDER.indexOf(level);
  }

  private nextLevel(level: PolicyRiskLevel): PolicyRiskLevel {
    const index = this.rank(level);
    return POLICY_RISK_ORDER[Math.min(index + 1, POLICY_RISK_ORDER.length - 1)]!;
  }
}
