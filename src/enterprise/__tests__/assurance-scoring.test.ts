import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeDomainAssessments, computeOverallScore } from '../assurance/scoring.js';
import { deriveFindingsFromEvaluations } from '../assurance/findings.js';
import { buildTestFramework } from './assurance-support.js';
import type { AssuranceControlEvaluation, AssuranceControlStatus, AssuranceFramework } from '../assurance/contracts.js';

function evaluation(controlId: string, domainId: string, status: AssuranceControlStatus, overrides: Partial<AssuranceControlEvaluation> = {}): AssuranceControlEvaluation {
  return {
    controlEvaluationId: `eval-${controlId}`,
    assessmentId: 'assessment-1',
    controlId,
    controlVersion: '1.0.0',
    domainId,
    status,
    score: status === 'pass' ? 100 : status === 'partial' ? 50 : 0,
    maximumScore: 100,
    confidence: 'high',
    evidenceReferenceIds: [],
    rejectedEvidenceReferenceIds: [],
    criteriaResults: [],
    reasonCodes: [],
    summary: `${controlId}: ${status}`,
    evaluatedAt: '2026-06-15T00:00:00.000Z',
    evaluatorVersion: 'aoc.assurance-evaluator.v1',
    ...overrides,
  };
}

function nextIdFactory(): (prefix: string) => string {
  let counter = 0;
  return (prefix: string) => `${prefix}-${(counter += 1)}`;
}

function domainScores(framework: AssuranceFramework, evaluations: readonly AssuranceControlEvaluation[]) {
  return computeDomainAssessments({ framework, evaluations, findings: [], assessmentId: 'assessment-1', nextId: nextIdFactory(), evaluatedAt: '2026-06-15T00:00:00.000Z' });
}

describe('Assurance scoring -- domain formula and traces (mission sections 27-29/82)', () => {
  const framework = buildTestFramework();

  it('computes the weighted domain formula: sum(status x weight) / sum(applicable weights)', () => {
    // d.core: c.bool weight 2 (pass=1), c.threshold weight 1 (partial=0.5) -> (2 + 0.5) / 3 = 83.33
    const domains = domainScores(framework, [evaluation('c.bool', 'd.core', 'pass'), evaluation('c.threshold', 'd.core', 'partial')]);
    const core = domains.find((domain) => domain.domainId === 'd.core');
    assert.equal(core?.normalizedScore, 83.33);
    assert.equal(core?.maximumScore, 3);
    assert.equal(core?.score, 2.5);
  });

  it('every domain result carries a per-control calculation trace sufficient to reconstruct the exact score', () => {
    const domains = domainScores(framework, [evaluation('c.bool', 'd.core', 'pass'), evaluation('c.threshold', 'd.core', 'fail')]);
    const core = domains.find((domain) => domain.domainId === 'd.core');
    assert.ok(core);
    const included = core.contributions.filter((contribution) => !contribution.excluded);
    const raw = included.reduce((sum, contribution) => sum + (contribution.rawValue ?? 0) * contribution.weight, 0);
    const max = included.reduce((sum, contribution) => sum + contribution.weight, 0);
    assert.equal(Math.round((raw / max) * 10000) / 100, core.normalizedScore, 'the trace reconstructs the exact normalized score');
  });

  it('not_applicable controls are always excluded from the denominator', () => {
    const domains = domainScores(framework, [
      evaluation('c.presence', 'd.review', 'pass'),
      evaluation('c.manual', 'd.review', 'pass'),
      evaluation('c.agent-only', 'd.review', 'not_applicable'),
    ]);
    const reviewDomain = domains.find((domain) => domain.domainId === 'd.review');
    assert.equal(reviewDomain?.normalizedScore, 100);
    const naContribution = reviewDomain?.contributions.find((contribution) => contribution.controlId === 'c.agent-only');
    assert.equal(naContribution?.excluded, true);
    assert.match(naContribution?.exclusionReason ?? '', /not_applicable/);
  });

  it("unknownPolicy 'zero' scores unknown as 0 without hiding it; 'exclude' removes it from the denominator", () => {
    const zeroDomains = domainScores(framework, [evaluation('c.bool', 'd.core', 'pass'), evaluation('c.threshold', 'd.core', 'unknown')]);
    const zeroCore = zeroDomains.find((domain) => domain.domainId === 'd.core');
    assert.equal(zeroCore?.normalizedScore, 66.67, 'unknown scored as zero: 2/3');

    const excludeFramework = buildTestFramework({ scoringModel: { ...framework.scoringModel, unknownPolicy: 'exclude' } });
    const excludeDomains = domainScores(excludeFramework, [evaluation('c.bool', 'd.core', 'pass'), evaluation('c.threshold', 'd.core', 'unknown')]);
    const excludeCore = excludeDomains.find((domain) => domain.domainId === 'd.core');
    assert.equal(excludeCore?.normalizedScore, 100, 'unknown excluded from the denominator');
    const excluded = excludeCore?.contributions.find((contribution) => contribution.controlId === 'c.threshold');
    assert.equal(excluded?.excluded, true);
  });

  it("manualReviewPolicy 'zero' vs 'exclude'/'provisional' controls the manual_review_required denominator", () => {
    const zeroFramework = buildTestFramework({ scoringModel: { ...framework.scoringModel, manualReviewPolicy: 'zero' } });
    const zeroDomains = domainScores(zeroFramework, [evaluation('c.presence', 'd.review', 'pass'), evaluation('c.manual', 'd.review', 'manual_review_required')]);
    const zeroReview = zeroDomains.find((domain) => domain.domainId === 'd.review');
    assert.equal(zeroReview?.normalizedScore, 50);

    const provisionalDomains = domainScores(framework, [evaluation('c.presence', 'd.review', 'pass'), evaluation('c.manual', 'd.review', 'manual_review_required')]);
    const provisionalReview = provisionalDomains.find((domain) => domain.domainId === 'd.review');
    assert.equal(provisionalReview?.normalizedScore, 100, "manualReviewPolicy 'provisional' excludes the pending control from the denominator");
  });

  it('a blocking-control failure overrides a strong numeric average (domain unhealthy)', () => {
    const evaluations = [evaluation('c.bool', 'd.core', 'fail'), evaluation('c.threshold', 'd.core', 'pass')];
    const findings = deriveFindingsFromEvaluations({ framework, evaluations, assessmentId: 'assessment-1', nextId: nextIdFactory(), now: () => '2026-06-15T00:00:00.000Z' });
    const domains = computeDomainAssessments({ framework, evaluations, findings, assessmentId: 'assessment-1', nextId: nextIdFactory(), evaluatedAt: '2026-06-15T00:00:00.000Z' });
    const core = domains.find((domain) => domain.domainId === 'd.core');
    assert.equal(core?.status, 'unhealthy');
    assert.ok((core?.blockingFindingIds.length ?? 0) > 0, 'the blocking failure is traceable to its finding');
    assert.ok(core?.summary.includes('override'), 'the override is stated in the summary, never hidden');
  });

  it('a domain below its minimumScore is unhealthy even without blocking failures', () => {
    const domains = domainScores(framework, [evaluation('c.bool', 'd.core', 'partial'), evaluation('c.threshold', 'd.core', 'fail')]);
    const core = domains.find((domain) => domain.domainId === 'd.core');
    assert.ok((core?.normalizedScore ?? 100) < 40);
    assert.equal(core?.status, 'unhealthy');
  });

  it('domain statuses: healthy / degraded / unknown / not_applicable derive deterministically', () => {
    const healthy = domainScores(framework, [evaluation('c.bool', 'd.core', 'pass'), evaluation('c.threshold', 'd.core', 'pass')]);
    assert.equal(healthy.find((domain) => domain.domainId === 'd.core')?.status, 'healthy');

    const degraded = domainScores(framework, [evaluation('c.bool', 'd.core', 'pass'), evaluation('c.threshold', 'd.core', 'partial')]);
    assert.equal(degraded.find((domain) => domain.domainId === 'd.core')?.status, 'degraded');

    const excludeFramework = buildTestFramework({ scoringModel: { ...framework.scoringModel, unknownPolicy: 'exclude' } });
    const unknown = domainScores(excludeFramework, [evaluation('c.bool', 'd.core', 'unknown'), evaluation('c.threshold', 'd.core', 'unknown')]);
    assert.equal(unknown.find((domain) => domain.domainId === 'd.core')?.status, 'unknown');

    const notApplicable = domainScores(framework, [evaluation('c.agent-only', 'd.review', 'not_applicable')]);
    assert.equal(notApplicable.find((domain) => domain.domainId === 'd.review')?.status, 'not_applicable');
  });
});

describe('Assurance scoring -- overall score (mission sections 31-32/82)', () => {
  const framework = buildTestFramework();

  it('weights domain scores by the framework domain weights with a full calculation trace', () => {
    const evaluations = [
      evaluation('c.bool', 'd.core', 'pass'),
      evaluation('c.threshold', 'd.core', 'pass'),
      evaluation('c.presence', 'd.review', 'pass'),
      evaluation('c.manual', 'd.review', 'pass'),
      evaluation('c.agent-only', 'd.review', 'pass'),
    ];
    const domains = domainScores(framework, evaluations);
    const score = computeOverallScore({ framework, domainAssessments: domains, calculatedAt: '2026-06-15T00:00:00.000Z' });
    assert.equal(score.normalizedScore, 100);
    assert.equal(score.methodologyId, 'test.scoring');
    assert.equal(score.calculationTrace.length, 2);
    // Reconstruct from the trace: sum(normalized x weight) / sum(weight).
    const included = score.calculationTrace.filter((contribution) => !contribution.excluded);
    const raw = included.reduce((sum, contribution) => sum + contribution.normalizedScore * contribution.weight, 0);
    const weight = included.reduce((sum, contribution) => sum + contribution.weight, 0);
    assert.equal(Math.round((raw / weight) * 100) / 100, score.normalizedScore);
  });

  it('not_applicable domains are excluded from the overall denominator with an explicit exclusion reason', () => {
    const evaluations = [
      evaluation('c.bool', 'd.core', 'pass'),
      evaluation('c.threshold', 'd.core', 'pass'),
      evaluation('c.agent-only', 'd.review', 'not_applicable'),
      evaluation('c.presence', 'd.review', 'not_applicable', { score: 0 }),
      evaluation('c.manual', 'd.review', 'not_applicable', { score: 0 }),
    ];
    const domains = domainScores(framework, evaluations);
    const score = computeOverallScore({ framework, domainAssessments: domains, calculatedAt: '2026-06-15T00:00:00.000Z' });
    assert.equal(score.normalizedScore, 100, 'only d.core participates');
    const excluded = score.calculationTrace.find((contribution) => contribution.domainId === 'd.review');
    assert.equal(excluded?.excluded, true);
    assert.ok(excluded?.exclusionReason);
  });

  it('the same inputs always produce the same score (deterministic calculation)', () => {
    const evaluations = [evaluation('c.bool', 'd.core', 'pass'), evaluation('c.threshold', 'd.core', 'partial')];
    const first = computeOverallScore({ framework, domainAssessments: domainScores(framework, evaluations), calculatedAt: 't' });
    const second = computeOverallScore({ framework, domainAssessments: domainScores(framework, evaluations), calculatedAt: 't' });
    assert.deepEqual(
      { raw: first.rawScore, max: first.maximumScore, normalized: first.normalizedScore, trace: first.calculationTrace },
      { raw: second.rawScore, max: second.maximumScore, normalized: second.normalizedScore, trace: second.calculationTrace },
    );
  });

  it('scores are framework-bound: the score carries its methodology identity, never a bare number', () => {
    const evaluations = [evaluation('c.bool', 'd.core', 'pass'), evaluation('c.threshold', 'd.core', 'pass')];
    const score = computeOverallScore({ framework, domainAssessments: domainScores(framework, evaluations), calculatedAt: 't' });
    assert.equal(score.methodologyId, framework.scoringModel.methodologyId);
    assert.equal(score.methodologyVersion, framework.scoringModel.methodologyVersion);
  });
});
