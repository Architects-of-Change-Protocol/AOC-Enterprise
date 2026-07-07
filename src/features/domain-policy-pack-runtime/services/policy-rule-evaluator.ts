import type { PolicyPackVersion } from '../domain/policy-pack-version.js';
import type { PolicyEvaluationInput, PolicyRuleEvaluationResult } from '../domain/policy-pack-evaluation.js';
import { PolicyConditionEvaluator } from './policy-condition-evaluator.js';

/**
 * Evaluates every active rule of every applicable policy pack version, in
 * deterministic priority order (ascending priority number, then rule id as
 * a tie-break). Never short-circuits: every active rule produces a result,
 * matched or not, so obligations/evidence/approval requirements from every
 * matched rule are preserved for aggregation downstream.
 */
export class PolicyRuleEvaluator {
  private readonly conditionEvaluator = new PolicyConditionEvaluator();

  evaluate(versions: readonly PolicyPackVersion[], input: PolicyEvaluationInput): readonly PolicyRuleEvaluationResult[] {
    const rules = versions
      .flatMap((version) => version.rules.filter((rule) => rule.status === 'active').map((rule) => ({ version, rule })))
      .sort((a, b) => a.rule.priority - b.rule.priority || (a.rule.id < b.rule.id ? -1 : a.rule.id > b.rule.id ? 1 : 0));

    return rules.map(({ version, rule }) => {
      const evaluation = this.conditionEvaluator.evaluate(rule.condition, input);

      if (!evaluation.matched) {
        return {
          policyPackId: version.policyPackId,
          policyPackVersionId: version.id,
          ruleId: rule.id,
          matched: false,
          severity: rule.severity,
          reasonCode: 'CONDITION_NOT_MATCHED',
          reason: `Rule ${rule.name} did not match: ${evaluation.reason}`,
          obligations: [],
          evidenceRequirements: [],
          approvalRequirements: [],
        } satisfies PolicyRuleEvaluationResult;
      }

      return {
        policyPackId: version.policyPackId,
        policyPackVersionId: version.id,
        ruleId: rule.id,
        matched: true,
        effectType: rule.effect.type,
        severity: rule.severity,
        reasonCode: rule.effect.reasonCode,
        reason: rule.effect.reason,
        obligations: rule.obligations,
        evidenceRequirements: rule.evidenceRequirements,
        approvalRequirements: rule.approvalRequirements,
        ...(rule.effect.riskOverride !== undefined ? { riskOverride: rule.effect.riskOverride } : {}),
        ...(rule.effect.limitedActions !== undefined ? { limitedActions: rule.effect.limitedActions } : {}),
        ...(rule.effect.limitedCapabilities !== undefined ? { limitedCapabilities: rule.effect.limitedCapabilities } : {}),
        ...(rule.effect.limitedResourceScopes !== undefined ? { limitedResourceScopes: rule.effect.limitedResourceScopes } : {}),
        ...(rule.effect.metadata !== undefined ? { metadata: rule.effect.metadata } : {}),
      } satisfies PolicyRuleEvaluationResult;
    });
  }
}
