import { computeDigest } from '../governance-store/digest.js';
import { AOC_CANONICALIZATION_VERSION } from '../governance-store/canonical-json.js';
import { AssuranceError } from './errors.js';
import type {
  AssuranceAssessment,
  AssuranceAssessmentIntegrity,
  AssuranceAssessmentStatus,
  AssuranceControlEvaluation,
  AssuranceDomainAssessment,
  AssuranceEligibilityResult,
  AssuranceEvidenceReference,
  AssuranceEvidenceResolution,
  AssuranceFinding,
  AssuranceScope,
  AssuranceScore,
} from './contracts.js';

/**
 * Assessment lifecycle and integrity (mission sections 36-40).
 *
 * Lifecycle:
 *
 *   created -> collecting_evidence -> evaluating -> manual_review | completed | failed
 *
 * A completed assessment is immutable; changed evidence, scope, or
 * framework version always requires a NEW assessment (`requestReassessment`
 * in `service.ts`). `superseded` is store-level bookkeeping layered over a
 * completed assessment -- it never alters content or digests.
 */

const ASSESSMENT_TRANSITIONS: Readonly<Record<AssuranceAssessmentStatus, readonly AssuranceAssessmentStatus[]>> = {
  created: ['collecting_evidence', 'failed'],
  collecting_evidence: ['evaluating', 'failed'],
  evaluating: ['manual_review', 'completed', 'failed'],
  manual_review: ['evaluating', 'completed', 'failed'],
  completed: ['superseded'],
  failed: [],
  superseded: [],
};

export function assertAssessmentTransition(current: AssuranceAssessmentStatus, next: AssuranceAssessmentStatus): void {
  if (!ASSESSMENT_TRANSITIONS[current].includes(next)) {
    throw new AssuranceError('ASSURANCE_ASSESSMENT_IMMUTABLE', `Assessment status cannot transition from '${current}' to '${next}'.`, {
      validTransitions: ASSESSMENT_TRANSITIONS[current],
    });
  }
}

export interface ComputeAssessmentIntegrityInput {
  readonly assessmentId: string;
  readonly assessmentVersion: string;
  readonly scope: AssuranceScope;
  readonly evidenceReferences: readonly AssuranceEvidenceReference[];
  readonly evidenceResolutions: readonly AssuranceEvidenceResolution[];
  readonly controlEvaluations: readonly AssuranceControlEvaluation[];
  readonly findings: readonly AssuranceFinding[];
  readonly domainAssessments: readonly AssuranceDomainAssessment[];
  readonly score: AssuranceScore;
  readonly eligibility: readonly AssuranceEligibilityResult[];
  readonly provenanceDigestInput: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly completedAt?: string;
}

/**
 * SHA-256 over `aoc.canonical-json.v1` (reused verbatim from the Governance
 * Store). Digests deliberately cover the assessment's frozen content
 * sections -- never the mutable lifecycle overlay (`status`,
 * `supersededByAssessmentId`), so supersession bookkeeping can never
 * invalidate a completed assessment's integrity.
 */
export function computeAssessmentIntegrity(input: ComputeAssessmentIntegrityInput): AssuranceAssessmentIntegrity {
  const scopeDigest = computeDigest(input.scope);
  const evidenceDigest = computeDigest({ references: input.evidenceReferences, resolutions: input.evidenceResolutions });
  const controlEvaluationsDigest = computeDigest(input.controlEvaluations);
  const findingsDigest = computeDigest(input.findings);
  const domainAssessmentsDigest = computeDigest(input.domainAssessments);
  const scoreDigest = computeDigest(input.score);
  const eligibilityDigest = computeDigest(input.eligibility);

  const assessmentDigest = computeDigest({
    assessmentId: input.assessmentId,
    assessmentVersion: input.assessmentVersion,
    provenance: input.provenanceDigestInput,
    scopeDigest,
    evidenceDigest,
    controlEvaluationsDigest,
    findingsDigest,
    domainAssessmentsDigest,
    scoreDigest,
    eligibilityDigest,
    createdAt: input.createdAt,
    completedAt: input.completedAt ?? null,
  });

  return {
    algorithm: 'sha256',
    canonicalizationVersion: AOC_CANONICALIZATION_VERSION,
    scopeDigest,
    evidenceDigest,
    controlEvaluationsDigest,
    findingsDigest,
    domainAssessmentsDigest,
    scoreDigest,
    eligibilityDigest,
    assessmentDigest,
  };
}

/** Recomputes the frozen-content integrity of a stored assessment -- the shared primitive `verification.ts` builds on. */
export function recomputeAssessmentIntegrity(assessment: AssuranceAssessment): AssuranceAssessmentIntegrity {
  return computeAssessmentIntegrity({
    assessmentId: assessment.assessmentId,
    assessmentVersion: assessment.assessmentVersion,
    scope: assessment.scope,
    evidenceReferences: assessment.evidenceReferences,
    evidenceResolutions: assessment.evidenceResolutions,
    controlEvaluations: assessment.controlEvaluations,
    findings: assessment.findings,
    domainAssessments: assessment.domainAssessments,
    score: assessment.score,
    eligibility: assessment.eligibility,
    provenanceDigestInput: { ...assessment.provenance },
    createdAt: assessment.createdAt,
    ...(assessment.completedAt !== undefined ? { completedAt: assessment.completedAt } : {}),
  });
}

/** An empty score placeholder for assessments that have not been evaluated yet -- explicit zeros with an explicit methodology, never fabricated numbers. */
export function emptyAssuranceScore(methodologyId: string, methodologyVersion: string, calculatedAt: string): AssuranceScore {
  return {
    rawScore: 0,
    maximumScore: 0,
    normalizedScore: 0,
    domainScores: [],
    calculationTrace: [],
    methodologyId,
    methodologyVersion,
    calculatedAt,
  };
}
