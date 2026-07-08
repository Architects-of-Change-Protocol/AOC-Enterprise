import type { PolicyPackControlPlaneRequirement } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import { assertNoPMFreakAgentPassportOverclaim } from './pmfreak-claim-safety.js';
import { PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID } from './pmfreak-agent-passport-constants.js';
import type { PMFreakAgentPassportControlPlaneSummary, PMFreakAgentPassportResolution } from './pmfreak-agent-passport-types.js';

/**
 * Safe, natural-language Control Plane labels for the PMFreak Agent
 * Passport Demo Pack. Every label is checked by this pack's own tests
 * against `evaluatePMFreakAgentPassportClaimSafety` -- none claims full
 * trust, autonomous approval, compliance certification, or risk-free
 * execution.
 */
export const PMFREAK_CONTROL_PLANE_SAFE_LABELS = [
  'PMFreak agent passport',
  'AOC-governed agent',
  'Demo baseline',
  'Authority-scoped',
  'Capability-gated',
  'Evidence required',
  'Approval required',
  'Audit-ready',
  'Not production integration',
  'Not compliance certification',
] as const;

/** The Control Plane requirement carried on the PMFreak demo pack manifest itself. */
export const PMFREAK_CONTROL_PLANE_REQUIREMENT: PolicyPackControlPlaneRequirement = {
  id: `${PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID}.control-plane`,
  surface: 'policy_pack',
  required: true,
  safeDisplayLabels: PMFREAK_CONTROL_PLANE_SAFE_LABELS,
};

/**
 * Builds a Control Plane summary for a single PMFreak agent passport action
 * resolution. Never renders UI and never calls a real Control Plane -- this
 * is a plain, deterministic, claim-safe data projection of the resolution,
 * re-scanned here with `assertNoPMFreakAgentPassportOverclaim` as defense in
 * depth.
 */
export function createPMFreakAgentPassportControlPlaneSummary(resolution: PMFreakAgentPassportResolution): PMFreakAgentPassportControlPlaneSummary {
  const summary: PMFreakAgentPassportControlPlaneSummary = {
    agentId: resolution.agentId,
    passportId: resolution.passportId,
    ...(resolution.role !== undefined ? { role: resolution.role } : {}),
    passportStatus: resolution.passportStatus,
    attemptedActionId: resolution.actionId,
    decision: resolution.decision,
    allowedByPassport: resolution.allowedByPassport,
    allowedByCapability: resolution.allowedByCapability,
    allowedByAuthorityScope: resolution.allowedByAuthorityScope,
    evidenceSatisfied: resolution.evidenceSatisfied,
    approvalsSatisfied: resolution.approvalsSatisfied,
    missingEvidenceIds: resolution.missingEvidenceIds,
    missingApprovalIds: resolution.missingApprovalIds,
    appliedPolicyPackIds: resolution.appliedPolicyPackIds,
    jurisdictionPackIds: resolution.jurisdictionPackIds,
    safeDisplayLabels: PMFREAK_CONTROL_PLANE_SAFE_LABELS,
    warnings: resolution.warnings,
    errors: resolution.errors,
  };

  assertNoPMFreakAgentPassportOverclaim(summary);
  return summary;
}
