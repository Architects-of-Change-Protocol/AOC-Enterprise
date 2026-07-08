import { assertNoPMFreakAgentPassportOverclaim } from './pmfreak-claim-safety.js';
import { PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID } from './pmfreak-agent-passport-constants.js';
import type { PMFreakAgentPassportExportMetadata, PMFreakAgentPassportResolution } from './pmfreak-agent-passport-types.js';

/**
 * Builds export metadata for a single PMFreak agent passport action
 * resolution -- a claim-safe, deterministic audit record. Never claims
 * legal approval, compliance certification, guaranteed safety, production
 * authorization, invoice validity, or contractual validity; re-scanned here
 * with `assertNoPMFreakAgentPassportOverclaim` as defense in depth.
 */
export function createPMFreakAgentPassportExportMetadata(resolution: PMFreakAgentPassportResolution): PMFreakAgentPassportExportMetadata {
  const metadata: PMFreakAgentPassportExportMetadata = {
    packId: PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID,
    exportId: `aoc.export.pmfreak.agent_passport.${resolution.actionAttemptId}`,
    agentId: resolution.agentId,
    passportId: resolution.passportId,
    ...(resolution.role !== undefined ? { role: resolution.role } : {}),
    passportStatus: resolution.passportStatus,
    attemptedActionId: resolution.actionId,
    decision: resolution.decision,
    requiredEvidenceIds: resolution.requiredEvidenceIds,
    missingEvidenceIds: resolution.missingEvidenceIds,
    requiredApprovalIds: resolution.requiredApprovalIds,
    missingApprovalIds: resolution.missingApprovalIds,
    allowedByAuthorityScope: resolution.allowedByAuthorityScope,
    appliedPolicyPackIds: resolution.appliedPolicyPackIds,
    jurisdictionPackIds: resolution.jurisdictionPackIds,
    warnings: resolution.warnings,
    errors: resolution.errors,
    safeFraming: {
      notLegalAdvice: true,
      notComplianceCertification: true,
      noCompletenessClaim: true,
      demoOnly: true,
    },
  };

  assertNoPMFreakAgentPassportOverclaim(metadata);
  return metadata;
}
