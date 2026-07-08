import type { PolicyPack } from '../../domain-policy-pack-runtime/domain/policy-pack.js';
import type { PolicyPackLegalCompleteness, PolicyPackVersion } from '../../domain-policy-pack-runtime/domain/policy-pack-version.js';
import type { PilotLegalCompleteness } from '../domain/pilot-scope.js';
import type { PilotPolicyModel } from '../domain/pilot-policy.js';

/**
 * Maps `PolicyPackVersion.legalCompleteness` onto `PilotLegalCompleteness`.
 * This is a relabeling only -- it never upgrades what the policy pack
 * itself asserted, and it never claims production/regulatory compliance.
 */
const LEGAL_COMPLETENESS_MAP: Readonly<Record<PolicyPackLegalCompleteness, PilotLegalCompleteness>> = {
  not_legal_advice: 'not_legal_advice',
  partial_policy_model: 'demo_policy_model',
  customer_provided_policy: 'customer_policy_model',
  verified_by_customer: 'customer_validated',
  verified_by_counsel: 'counsel_validated',
};

export function mapPolicyPackVersionLegalCompleteness(version: PolicyPackVersion): PilotLegalCompleteness {
  return LEGAL_COMPLETENESS_MAP[version.legalCompleteness];
}

export interface PolicyPackBindingSummary {
  readonly policyPackId: string;
  readonly policyPackVersionId: string;
  readonly demoOnly: boolean;
  readonly legalCompleteness: PilotLegalCompleteness;
  readonly ruleIds: readonly string[];
}

export function summarizePolicyPackVersion(pack: PolicyPack, version: PolicyPackVersion): PolicyPackBindingSummary {
  return {
    policyPackId: pack.id,
    policyPackVersionId: version.id,
    demoOnly: version.demoOnly,
    legalCompleteness: mapPolicyPackVersionLegalCompleteness(version),
    ruleIds: version.rules.map((rule) => rule.id),
  };
}

export function requiredPolicyPackIds(policyModel: PilotPolicyModel): readonly string[] {
  return policyModel.policyPackIds;
}

/** Only 'customer_validated'/'counsel_validated' may ever be read as a compliance claim -- and even then only by the caller who set them, never inferred here. */
export function policyModelClaimsValidatedCompleteness(policyModel: PilotPolicyModel): boolean {
  return policyModel.legalCompleteness === 'customer_validated' || policyModel.legalCompleteness === 'counsel_validated';
}
