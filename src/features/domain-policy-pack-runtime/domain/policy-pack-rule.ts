import type { PolicyCondition } from './policy-pack-condition.js';
import type { PolicyEffect } from './policy-pack-effect.js';
import type { PolicyObligation } from './policy-pack-obligation.js';
import type { PolicyEvidenceRequirement } from './policy-pack-evidence.js';
import type { PolicyApprovalRequirement } from './policy-pack-approval.js';

export type PolicyPackRuleStatus = 'active' | 'deprecated' | 'disabled';

export type PolicyPackRuleSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface PolicyPackRule {
  readonly id: string;
  readonly policyPackVersionId: string;
  readonly name: string;
  readonly description: string;
  readonly status: PolicyPackRuleStatus;
  readonly priority: number;
  readonly condition: PolicyCondition;
  readonly effect: PolicyEffect;
  readonly obligations: readonly PolicyObligation[];
  readonly evidenceRequirements: readonly PolicyEvidenceRequirement[];
  readonly approvalRequirements: readonly PolicyApprovalRequirement[];
  readonly severity: PolicyPackRuleSeverity;
  readonly sourceIds: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
