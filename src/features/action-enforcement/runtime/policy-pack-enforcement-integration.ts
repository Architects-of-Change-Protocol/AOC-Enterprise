/**
 * Re-exports the structural Domain Policy Pack Runtime integration types for
 * runtime composition roots (`ActionEnforcementRuntimeOptions.policyPackIntegration`,
 * fixtures, hosts). The types themselves live in
 * `../domain/policy-pack-enforcement.js` alongside every other Action
 * Enforcement domain type -- this module exists so callers wiring up the
 * runtime can import the integration shape from `runtime/` without reaching
 * into `domain/`, mirroring where `ActionEnforcementRuntimeOptions` itself
 * lives.
 */
export type {
  EnforcementPolicyPackIntegration,
  EnforcementPolicyPackEvaluationInput,
  EnforcementPolicyPackEvaluationResult,
  EnforcementPolicyPackEvidenceRequirement,
  EnforcementPolicyPackApprovalRequirement,
  EnforcementPolicyPackObligation,
  PolicyPackEnforcementDecisionType,
} from '../domain/policy-pack-enforcement.js';
