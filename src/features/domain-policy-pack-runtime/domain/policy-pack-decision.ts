import type { PolicyRiskLevel } from './policy-pack-effect.js';
import type { PolicyObligation } from './policy-pack-obligation.js';
import type { PolicyEvidenceRequirement } from './policy-pack-evidence.js';
import type { PolicyApprovalRequirement } from './policy-pack-approval.js';

export type PolicyPackDecisionType =
  | 'allowed'
  | 'denied'
  | 'requires_evidence'
  | 'requires_approval'
  | 'requires_authority'
  | 'requires_external_standing'
  | 'limited'
  | 'warning'
  | 'not_applicable'
  | 'invalid_input';

export interface PolicyPackDecision {
  readonly id: string;
  readonly inputId: string;
  readonly type: PolicyPackDecisionType;
  readonly allowed: boolean;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly riskLevel: PolicyRiskLevel;
  readonly effectiveRiskLevel: PolicyRiskLevel;
  readonly applicablePackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly obligations: readonly PolicyObligation[];
  readonly evidenceRequirements: readonly PolicyEvidenceRequirement[];
  readonly approvalRequirements: readonly PolicyApprovalRequirement[];
  readonly limitedActions?: readonly string[];
  readonly limitedCapabilities?: readonly string[];
  readonly limitedResourceScopes?: readonly string[];
  readonly reasonCode: string;
  readonly reason: string;
  readonly decidedAt: string;
  readonly proofId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
