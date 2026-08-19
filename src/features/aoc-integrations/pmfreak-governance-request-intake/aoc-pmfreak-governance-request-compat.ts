/**
 * Soberanía-side compatibility surface for PMFreak Governance Request Client v1's
 * request shape. The canonical declaration lives in
 * `aoc-pmfreak-governance-intake-types.ts` alongside every other type this
 * intake owns; this module re-exports it under the name the PR's suggested
 * folder structure calls out, so callers can import the request-compat
 * surface on its own without pulling in response/config/client types.
 */
export type {
  AocPMFreakGovernanceRequest,
  AocPMFreakGovernanceRequestActionAttempt,
  AocPMFreakGovernanceRequestAgentContext,
  AocPMFreakGovernanceRequestActionContext,
  AocPMFreakGovernanceRequestApprovalContext,
  AocPMFreakGovernanceRequestBillingContext,
  AocPMFreakGovernanceRequestEvidenceContext,
  AocPMFreakGovernanceRequestPolicyContext,
  AocPMFreakGovernanceRequestProjectContext,
  AocPMFreakGovernanceRequestRiskContext,
  AocPMFreakGovernanceRequestRiskSeverity,
  AocPMFreakGovernanceIntakeRequestMode,
} from './aoc-pmfreak-governance-intake-types.js';
