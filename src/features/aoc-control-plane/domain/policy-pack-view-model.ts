import type { AocMetric } from './control-plane-metric.js';

// --- Policy Packs ---
//
// These rows are pure projections over Domain Policy Pack Runtime's own
// control-plane adapter output (see
// domain-policy-pack-runtime/integrations/control-plane-policy-pack-adapter.ts)
// plus Action Enforcement's EnforcementDecision/EnforcementProof policy
// reference fields. Nothing here evaluates a policy condition or rule, and
// nothing here infers legal compliance -- nothing beyond what
// `legalCompleteness`/`demoOnly` already state on the underlying policy pack
// version.

export interface PolicyPackRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly domain: string;
  readonly status: string;
  readonly currentVersionId: string;
  readonly versionCount: number;
  readonly activeVersionCount: number;
  readonly demoOnly: boolean;
  readonly legalCompleteness: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PolicyPackVersionRow {
  readonly id: string;
  readonly policyPackId: string;
  readonly policyPackName: string;
  readonly version: string;
  readonly status: string;
  readonly demoOnly: boolean;
  readonly legalCompleteness: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly ruleCount: number;
  readonly sourceCount: number;
  readonly scopeSummary: string;
  readonly jurisdictions: readonly string[];
  readonly countries: readonly string[];
  readonly domains: readonly string[];
  readonly actions: readonly string[];
}

export interface PolicyRuleRow {
  readonly id: string;
  readonly policyPackId: string;
  readonly policyPackVersionId: string;
  readonly policyPackName: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly status: string;
  readonly priority: number;
  readonly effectType: string;
  readonly severity: string;
  readonly reasonCode: string;
  readonly sourceIds: readonly string[];
  readonly obligationCount: number;
  readonly evidenceRequirementCount: number;
  readonly approvalRequirementCount: number;
}

export interface PolicyObligationRow {
  readonly id: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
  readonly sourceRuleId?: string;
}

export interface PolicyEvidenceRequirementRow {
  readonly id: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
  readonly sourceRuleId?: string;
}

export interface PolicyApprovalRequirementRow {
  readonly id: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
  readonly minimumApprovals: number;
  readonly requiresSegregationOfDuties: boolean;
  readonly requiredAuthorityCapability?: string;
  readonly sourceRuleId?: string;
}

export interface PolicyEvaluationRow {
  readonly id: string;
  readonly inputId: string;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly domain?: string;
  readonly jurisdiction?: string;
  readonly country?: string;
  readonly riskLevel: string;
  readonly effectiveRiskLevel: string;
  readonly decisionId: string;
  readonly decisionType: string;
  readonly allowed: boolean;
  readonly applicablePackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly proofId?: string;
  readonly policyProofHash?: string;
  readonly evaluatedAt: string;
}

export interface PolicyDecisionRow {
  readonly id: string;
  readonly inputId: string;
  readonly type: string;
  readonly allowed: boolean;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly riskLevel: string;
  readonly effectiveRiskLevel: string;
  readonly applicablePackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly reasonCode: string;
  readonly reason: string;
  readonly obligationIds: readonly string[];
  readonly evidenceRequirementIds: readonly string[];
  readonly approvalRequirementIds: readonly string[];
  /** Full obligation/evidence/approval rows for the matched decision, alongside the id-only arrays above -- powers PolicyObligationsList/PolicyEvidenceRequirementsList/PolicyApprovalRequirementsList without those components needing to re-look-up anything. */
  readonly obligations: readonly PolicyObligationRow[];
  readonly evidenceRequirements: readonly PolicyEvidenceRequirementRow[];
  readonly approvalRequirements: readonly PolicyApprovalRequirementRow[];
  readonly proofId?: string;
  readonly decidedAt: string;
}

export interface PolicyProofRow {
  readonly id: string;
  readonly evaluationId: string;
  readonly decisionId: string;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly policyPackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly inputHash: string;
  readonly ruleResultsHash: string;
  readonly decisionHash: string;
  readonly previousHash?: string;
  readonly proofHash: string;
  readonly createdAt: string;
}

export interface PolicyEventRow {
  readonly id: string;
  readonly type: string;
  readonly summary: string;
  readonly policyPackId?: string;
  readonly policyPackVersionId?: string;
  readonly evaluationId?: string;
  readonly decisionId?: string;
  readonly proofId?: string;
  readonly trustDomainId?: string;
  readonly actorId?: string;
  readonly timestamp: string;
  readonly eventHash: string;
  readonly previousHash?: string;
}

/**
 * Links an Action Enforcement decision/proof back to the Domain Policy Pack
 * Runtime decision/proof it consulted during preflight. Only ever built from
 * fields Action Enforcement's own EnforcementDecision/EnforcementProof
 * already carry (policyDecisionId, policyProofId, policyPackVersionIds,
 * policyMatchedRuleIds, ...) -- it never re-runs policy evaluation.
 */
export interface PolicyEnforcementLinkRow {
  readonly id: string;
  readonly enforcementRequestId?: string;
  readonly enforcementDecisionId?: string;
  readonly enforcementProofId?: string;
  readonly policyDecisionId?: string;
  readonly policyProofId?: string;
  readonly policyPackVersionIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly action: string;
  readonly actorId: string;
  readonly resourceScope: string;
  readonly enforcementDecisionType?: string;
  readonly policyDecisionType?: string;
  readonly blockedByPolicy: boolean;
  readonly reasonCode?: string;
  readonly reason?: string;
}

/** Same shape as AocMetric -- reused rather than redefined so tone/rendering stay consistent with every other Control Plane metric. */
export type PolicyPackMetric = AocMetric;

export interface PolicyPackControlPlaneViewModel {
  readonly packs: readonly PolicyPackRow[];
  readonly versions: readonly PolicyPackVersionRow[];
  readonly rules: readonly PolicyRuleRow[];
  readonly evaluations: readonly PolicyEvaluationRow[];
  readonly decisions: readonly PolicyDecisionRow[];
  readonly proofs: readonly PolicyProofRow[];
  readonly events: readonly PolicyEventRow[];
  readonly enforcementLinks: readonly PolicyEnforcementLinkRow[];
  readonly metrics: readonly PolicyPackMetric[];
}

/** Populated with empty arrays/zero metrics when no Domain Policy Pack Runtime data is available -- never omitted, so `AocControlPlaneReadModel.policyPacks` stays a required field under exactOptionalPropertyTypes. */
export const EMPTY_POLICY_PACK_VIEW_MODEL: PolicyPackControlPlaneViewModel = {
  packs: [],
  versions: [],
  rules: [],
  evaluations: [],
  decisions: [],
  proofs: [],
  events: [],
  enforcementLinks: [],
  metrics: [],
};
