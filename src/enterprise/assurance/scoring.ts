import type {
  AssuranceControlEvaluation,
  AssuranceDomainAssessment,
  AssuranceDomainScoreContribution,
  AssuranceDomainStatus,
  AssuranceFinding,
  AssuranceFramework,
  AssuranceScore,
  AssuranceScoreContribution,
} from './contracts.js';

/**
 * The transparent Assurance scoring engine (mission sections 27-32). The
 * framework owns scoring -- this module only executes the framework's
 * `AssuranceScoringModel`, and every number it produces ships with a
 * calculation trace sufficient to reconstruct it exactly:
 *
 *   Domain Score = Σ(status score × control weight) ÷ Σ(applicable weights)
 *
 * `not_applicable` controls are always excluded from the denominator;
 * `unknown` and `manual_review_required` follow the framework's
 * `unknownPolicy`/`manualReviewPolicy`; blocking-control failures override
 * numeric averages where the framework's `blockingRule` says so -- an
 * average is never allowed to hide a critical failure.
 *
 * Rounding is the single documented rule everywhere: half-up to 2 decimal
 * places, applied only at trace/output boundaries (no hidden normalization).
 */

export function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ComputeDomainAssessmentsInput {
  readonly framework: AssuranceFramework;
  readonly evaluations: readonly AssuranceControlEvaluation[];
  readonly findings: readonly AssuranceFinding[];
  readonly assessmentId: string;
  readonly nextId: (prefix: string) => string;
  readonly evaluatedAt: string;
}

export function computeDomainAssessments(input: ComputeDomainAssessmentsInput): readonly AssuranceDomainAssessment[] {
  const { framework, evaluations, findings } = input;
  const scoring = framework.scoringModel;
  const evaluationsByControl = new Map(evaluations.map((evaluation) => [evaluation.controlId, evaluation]));

  return framework.domains.map((domain) => {
    const domainEvaluations = domain.controlIds
      .map((controlId) => evaluationsByControl.get(controlId))
      .filter((evaluation): evaluation is AssuranceControlEvaluation => evaluation !== undefined);

    const contributions: AssuranceScoreContribution[] = [];
    for (const evaluation of domainEvaluations) {
      const control = framework.controls.find((candidate) => candidate.controlId === evaluation.controlId);
      const weight = scoring.controlWeights[evaluation.controlId] ?? control?.scoring.weight ?? 1;
      const configured = scoring.statusScores[evaluation.status];

      let rawValue: number | null = configured;
      let excluded = false;
      let exclusionReason: string | undefined;

      if (evaluation.status === 'not_applicable') {
        rawValue = null;
        excluded = true;
        exclusionReason = 'not_applicable controls are always excluded from the denominator';
      } else if (evaluation.status === 'unknown' && configured === null) {
        if (scoring.unknownPolicy === 'zero') {
          rawValue = 0;
        } else {
          rawValue = null;
          excluded = true;
          exclusionReason = scoring.unknownPolicy === 'exclude' ? "unknownPolicy 'exclude'" : "unknownPolicy 'manual_review' (pending review, excluded from the denominator)";
        }
      } else if (evaluation.status === 'manual_review_required' && configured === null) {
        if (scoring.manualReviewPolicy === 'zero') {
          rawValue = 0;
        } else {
          rawValue = null;
          excluded = true;
          exclusionReason =
            scoring.manualReviewPolicy === 'exclude' ? "manualReviewPolicy 'exclude'" : "manualReviewPolicy 'provisional' (excluded from the denominator, result marked provisional)";
        }
      } else if (configured === null) {
        rawValue = null;
        excluded = true;
        exclusionReason = `scoring model defines no numeric value for status '${evaluation.status}'`;
      }

      contributions.push({
        controlId: evaluation.controlId,
        status: evaluation.status,
        rawValue,
        weight,
        weightedValue: rawValue === null ? null : roundScore(rawValue * weight),
        excluded,
        ...(exclusionReason !== undefined ? { exclusionReason } : {}),
      });
    }

    const included = contributions.filter((contribution) => !contribution.excluded && contribution.rawValue !== null);
    const rawScore = included.reduce((sum, contribution) => sum + (contribution.rawValue ?? 0) * contribution.weight, 0);
    const maximumScore = included.reduce((sum, contribution) => sum + contribution.weight, 0);
    const normalizedScore = maximumScore > 0 ? roundScore((rawScore / maximumScore) * 100) : 0;

    // -- Blocking controls (mission section 30): a blocking failure overrides
    // the numeric average where the framework's blockingRule applies to domains.
    const blockingApplies = scoring.blockingRule === 'domain_override' || scoring.blockingRule === 'both';
    const failedBlockingControls = (domain.blockingControlIds ?? []).filter((controlId) => evaluationsByControl.get(controlId)?.status === 'fail');
    const blockingFindingIds = findings
      .filter((finding) => failedBlockingControls.includes(finding.controlId) && finding.domainId === domain.domainId)
      .map((finding) => finding.findingId);

    const statuses = domainEvaluations.map((evaluation) => evaluation.status);
    let status: AssuranceDomainStatus;
    if (domainEvaluations.length === 0 || statuses.every((candidate) => candidate === 'not_applicable')) {
      status = 'not_applicable';
    } else if (included.length === 0) {
      status = 'unknown';
    } else if (blockingApplies && failedBlockingControls.length > 0) {
      status = 'unhealthy';
    } else if (domain.minimumScore !== undefined && normalizedScore < domain.minimumScore) {
      status = 'unhealthy';
    } else if (statuses.some((candidate) => candidate === 'fail' || candidate === 'partial' || candidate === 'unknown' || candidate === 'manual_review_required')) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const summaryParts = [
      `Domain '${domain.domainId}' scored ${normalizedScore}/100 over ${included.length} applicable control(s) (${contributions.length - included.length} excluded).`,
    ];
    if (blockingApplies && failedBlockingControls.length > 0) {
      summaryParts.push(`Blocking control failure(s) [${failedBlockingControls.join(', ')}] override the numeric average: status 'unhealthy'.`);
    }

    return {
      domainAssessmentId: input.nextId('assurance-domain'),
      assessmentId: input.assessmentId,
      domainId: domain.domainId,
      status,
      score: roundScore(rawScore),
      maximumScore: roundScore(maximumScore),
      normalizedScore,
      controlEvaluationIds: domainEvaluations.map((evaluation) => evaluation.controlEvaluationId),
      findingIds: findings.filter((finding) => finding.domainId === domain.domainId).map((finding) => finding.findingId),
      blockingFindingIds,
      contributions,
      summary: summaryParts.join(' '),
      evaluatedAt: input.evaluatedAt,
    };
  });
}

export interface ComputeOverallScoreInput {
  readonly framework: AssuranceFramework;
  readonly domainAssessments: readonly AssuranceDomainAssessment[];
  readonly calculatedAt: string;
}

export function computeOverallScore(input: ComputeOverallScoreInput): AssuranceScore {
  const { framework, domainAssessments } = input;
  const scoring = framework.scoringModel;

  const calculationTrace: AssuranceDomainScoreContribution[] = domainAssessments.map((assessment) => {
    const domain = framework.domains.find((candidate) => candidate.domainId === assessment.domainId);
    const weight = scoring.domainWeights[assessment.domainId] ?? domain?.weight ?? 0;
    const excluded = assessment.status === 'not_applicable' || assessment.status === 'unknown';
    return {
      domainId: assessment.domainId,
      status: assessment.status,
      normalizedScore: assessment.normalizedScore,
      weight,
      weightedValue: excluded ? null : roundScore(assessment.normalizedScore * weight),
      excluded,
      ...(excluded
        ? { exclusionReason: assessment.status === 'not_applicable' ? 'domain not applicable under this scope' : 'domain produced no scoreable control results' }
        : {}),
    };
  });

  const included = calculationTrace.filter((contribution) => !contribution.excluded);
  const totalWeight = included.reduce((sum, contribution) => sum + contribution.weight, 0);
  const rawScore = included.reduce((sum, contribution) => sum + contribution.normalizedScore * contribution.weight, 0);
  const maximumScore = totalWeight * 100;
  const normalizedScore = totalWeight > 0 ? roundScore(rawScore / totalWeight) : 0;

  return {
    rawScore: roundScore(rawScore),
    maximumScore: roundScore(maximumScore),
    normalizedScore,
    domainScores: domainAssessments.map((assessment) => ({
      domainId: assessment.domainId,
      domainAssessmentId: assessment.domainAssessmentId,
      normalizedScore: assessment.normalizedScore,
      status: assessment.status,
    })),
    calculationTrace,
    methodologyId: scoring.methodologyId,
    methodologyVersion: scoring.methodologyVersion,
    calculatedAt: input.calculatedAt,
  };
}
