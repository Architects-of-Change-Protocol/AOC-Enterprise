import type { PolicyRiskLevel } from './policy-pack-effect.js';

export type { PolicyRiskLevel } from './policy-pack-effect.js';

export const POLICY_RISK_ORDER: readonly PolicyRiskLevel[] = ['low', 'medium', 'high', 'critical'];

export interface PolicyRiskClassificationResult {
  readonly inputRiskLevel: PolicyRiskLevel;
  readonly effectiveRiskLevel: PolicyRiskLevel;
  readonly raisedByRuleIds: readonly string[];
}
