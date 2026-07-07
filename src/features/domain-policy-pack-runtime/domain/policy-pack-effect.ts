export type PolicyEffectType =
  | 'allow'
  | 'deny'
  | 'require_evidence'
  | 'require_approval'
  | 'require_authority'
  | 'require_external_standing'
  | 'limit_scope'
  | 'raise_risk'
  | 'warn'
  | 'no_op';

export type PolicyRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PolicyEffect {
  readonly type: PolicyEffectType;
  readonly reasonCode: string;
  readonly reason: string;
  readonly riskOverride?: PolicyRiskLevel;
  readonly limitedActions?: readonly string[];
  readonly limitedCapabilities?: readonly string[];
  readonly limitedResourceScopes?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
