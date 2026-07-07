import type { EvidenceValidationResult } from './evidence-validation.js';

export type EvidenceRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * A deterministic classification of evidence-gap risk, derived only from
 * counts already present on an EvidenceValidationResult. This is never a
 * legal or business risk conclusion -- it describes how incomplete the
 * evidence record is, nothing more.
 */
export interface EvidenceRiskAssessment {
  readonly level: EvidenceRiskLevel;
  readonly reasonCode: string;
  readonly reason: string;
  readonly missingRequirementCount: number;
  readonly rejectedEvidenceArtifactCount: number;
  readonly expiredEvidenceArtifactCount: number;
  readonly staleSourceDocumentCount: number;
}

/** Pure function over an EvidenceValidationResult's own counts -- never inspects evidence content or infers legal meaning. */
export function classifyEvidenceRisk(validation: EvidenceValidationResult): EvidenceRiskAssessment {
  const missingRequirementCount = validation.missingRequirementIds.length;
  const rejectedEvidenceArtifactCount = validation.rejectedEvidenceArtifactIds.length;
  const expiredEvidenceArtifactCount = validation.expiredEvidenceArtifactIds.length;
  const staleSourceDocumentCount = validation.staleSourceDocumentIds.length;

  if (rejectedEvidenceArtifactCount > 0 || missingRequirementCount > 0) {
    return {
      level: 'high',
      reasonCode: 'REQUIRED_EVIDENCE_MISSING_OR_REJECTED',
      reason: 'One or more required evidence requirements are unmet or were rejected.',
      missingRequirementCount,
      rejectedEvidenceArtifactCount,
      expiredEvidenceArtifactCount,
      staleSourceDocumentCount,
    };
  }

  if (expiredEvidenceArtifactCount > 0 || staleSourceDocumentCount > 0) {
    return {
      level: 'medium',
      reasonCode: 'EVIDENCE_STALE_OR_EXPIRED',
      reason: 'Evidence requirements are satisfied, but some evidence or its source document is stale or expired.',
      missingRequirementCount,
      rejectedEvidenceArtifactCount,
      expiredEvidenceArtifactCount,
      staleSourceDocumentCount,
    };
  }

  if (validation.requirementIds.length === 0) {
    return {
      level: 'none',
      reasonCode: 'NO_EVIDENCE_REQUIREMENTS',
      reason: 'No evidence requirements apply.',
      missingRequirementCount,
      rejectedEvidenceArtifactCount,
      expiredEvidenceArtifactCount,
      staleSourceDocumentCount,
    };
  }

  return {
    level: 'low',
    reasonCode: 'EVIDENCE_COMPLETE',
    reason: 'All evidence requirements are satisfied with current, accepted evidence.',
    missingRequirementCount,
    rejectedEvidenceArtifactCount,
    expiredEvidenceArtifactCount,
    staleSourceDocumentCount,
  };
}
