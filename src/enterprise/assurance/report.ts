import { computeDigest } from '../governance-store/digest.js';
import { AOC_CANONICALIZATION_VERSION } from '../governance-store/canonical-json.js';
import { AssuranceError } from './errors.js';
import type {
  AssuranceAssessment,
  AssuranceControlReport,
  AssuranceDomainReport,
  AssuranceEvidenceIndexEntry,
  AssuranceFindingReport,
  AssuranceFindingSeverity,
  AssuranceFramework,
  AssuranceReport,
  AssuranceReportView,
} from './contracts.js';
import { ASSURANCE_FINDING_SEVERITIES, ASSURANCE_REPORT_VIEWS } from './contracts.js';

/**
 * The canonical structured Assurance report (mission sections 66-68).
 * Canonical JSON only in v1 -- no PDF export. Reports are one-way
 * projections of a completed assessment: building a report never mutates
 * the assessment, multiple reports may derive from one assessment, and each
 * report carries its own digest distinct from the assessment digest.
 *
 * The human-readable narrative is generated DETERMINISTICALLY from
 * structured results (mission section 72) -- no LLM sits anywhere in this
 * path, and the structured fields remain canonical.
 */

export const ASSURANCE_REPORT_ENGINE_VERSION = 'aoc.assurance-report.v1';

export function isAssuranceReportView(value: string): value is AssuranceReportView {
  return (ASSURANCE_REPORT_VIEWS as readonly string[]).includes(value);
}

function highestOpenSeverity(assessment: AssuranceAssessment): AssuranceFindingSeverity | undefined {
  const openSeverities = new Set(assessment.findings.filter((finding) => finding.status === 'open').map((finding) => finding.severity));
  return ASSURANCE_FINDING_SEVERITIES.find((severity) => openSeverities.has(severity));
}

/** Deterministic executive narrative: a plain restatement of structured results, never a judgement beyond them. */
function buildNarrative(assessment: AssuranceAssessment): string {
  const openFindings = assessment.findings.filter((finding) => finding.status === 'open');
  const eligible = assessment.eligibility.filter((result) => result.eligible).map((result) => result.profileId);
  const provisional = assessment.eligibility.filter((result) => result.provisional).map((result) => result.profileId);
  const parts = [
    `Assessment '${assessment.assessmentId}' evaluated subject '${assessment.subject.subjectId}' (${assessment.subject.subjectType}) against framework '${assessment.frameworkId}' version '${assessment.frameworkVersion}'.`,
    `Scope '${assessment.scope.scopeId}' with evidence cutoff ${assessment.scope.evidenceCutoffAt}.`,
    `Overall score: ${assessment.score.normalizedScore} / 100 under methodology '${assessment.score.methodologyId}@${assessment.score.methodologyVersion}'. This score is framework-bound and scope-bound; it is not a universal trust score.`,
    `${assessment.controlEvaluations.length} control(s) evaluated across ${assessment.domainAssessments.length} domain(s); ${openFindings.length} open finding(s).`,
    eligible.length > 0 ? `Eligibility profiles satisfied: ${eligible.join(', ')}.` : 'No eligibility profile was satisfied.',
    ...(provisional.length > 0 ? [`Provisional (pending manual review): ${provisional.join(', ')}.`] : []),
    'Eligibility is an internal, evidence-bound determination -- it is not a certification, legal opinion, or external attestation.',
  ];
  return parts.join(' ');
}

export interface BuildAssuranceReportInput {
  readonly assessment: AssuranceAssessment;
  readonly framework: AssuranceFramework;
  readonly view: AssuranceReportView;
  readonly generatedBy: string;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
}

export function buildAssuranceReport(input: BuildAssuranceReportInput): AssuranceReport {
  const { assessment, framework, view } = input;
  if (assessment.status !== 'completed' && assessment.status !== 'superseded') {
    throw new AssuranceError('ASSURANCE_ASSESSMENT_INCOMPLETE', `Reports derive only from completed assessments; assessment '${assessment.assessmentId}' is '${assessment.status}'.`);
  }

  const includeControlDetail = view === 'INTERNAL' || view === 'AUDITOR';
  const includeControls = view !== 'PUBLIC';
  const includeFindingDetail = view === 'INTERNAL' || view === 'AUDITOR';
  const includeFindings = view !== 'PUBLIC';
  const includeEvidenceIndex = view === 'INTERNAL' || view === 'AUDITOR';

  const domainResults: AssuranceDomainReport[] = assessment.domainAssessments.map((domain) => {
    const definition = framework.domains.find((candidate) => candidate.domainId === domain.domainId);
    return {
      domainId: domain.domainId,
      name: definition?.name ?? domain.domainId,
      status: domain.status,
      normalizedScore: domain.normalizedScore,
      controlCount: domain.controlEvaluationIds.length,
      findingCount: domain.findingIds.length,
      summary: domain.summary,
    };
  });

  const controlResults: AssuranceControlReport[] = includeControls
    ? assessment.controlEvaluations.map((evaluation) => {
        const definition = framework.controls.find((candidate) => candidate.controlId === evaluation.controlId);
        return {
          controlId: evaluation.controlId,
          title: definition?.title ?? evaluation.controlId,
          domainId: evaluation.domainId,
          status: evaluation.status,
          confidence: evaluation.confidence,
          score: evaluation.score,
          maximumScore: evaluation.maximumScore,
          reasonCodes: evaluation.reasonCodes,
          summary: evaluation.summary,
          ...(includeControlDetail ? { criteriaResults: evaluation.criteriaResults, evidenceReferenceIds: evaluation.evidenceReferenceIds } : {}),
        };
      })
    : [];

  const findings: AssuranceFindingReport[] = includeFindings
    ? assessment.findings.map((finding) => ({
        findingId: finding.findingId,
        controlId: finding.controlId,
        domainId: finding.domainId,
        findingType: finding.findingType,
        severity: finding.severity,
        status: finding.status,
        title: finding.title,
        ...(includeFindingDetail ? { description: finding.description, remediation: finding.remediation, evidenceReferenceIds: finding.evidenceReferenceIds } : {}),
      }))
    : [];

  const evidenceIndex: AssuranceEvidenceIndexEntry[] = includeEvidenceIndex
    ? assessment.evidenceReferences.map((reference) => ({
        evidenceReferenceId: reference.evidenceReferenceId,
        evidenceType: reference.evidenceType,
        externalId: reference.externalId,
        verified: reference.verified,
        collectedAt: reference.collectedAt,
        ...(reference.digest !== undefined ? { digest: reference.digest } : {}),
      }))
    : [];

  const generatedAt = input.now();
  const reportId = input.nextId('assurance-report');
  const severity = highestOpenSeverity(assessment);

  const executiveSummary = {
    frameworkId: assessment.frameworkId,
    frameworkVersion: assessment.frameworkVersion,
    subjectId: assessment.subject.subjectId,
    subjectType: assessment.subject.subjectType,
    scopeId: assessment.scope.scopeId,
    evidenceCutoffAt: assessment.scope.evidenceCutoffAt,
    assessedAt: assessment.completedAt ?? assessment.createdAt,
    overallNormalizedScore: assessment.score.normalizedScore,
    domainCount: assessment.domainAssessments.length,
    controlCount: assessment.controlEvaluations.length,
    openFindingCount: assessment.findings.filter((finding) => finding.status === 'open').length,
    ...(severity !== undefined ? { highestOpenSeverity: severity } : {}),
    narrative: buildNarrative(assessment),
  };

  const provenance = {
    assessmentId: assessment.assessmentId,
    assessmentDigest: assessment.integrity.assessmentDigest,
    frameworkId: assessment.frameworkId,
    frameworkVersion: assessment.frameworkVersion,
    generatedAt,
    generatedBy: input.generatedBy,
    reportEngineVersion: ASSURANCE_REPORT_ENGINE_VERSION,
    view,
  };

  const reportDigest = computeDigest({
    reportId,
    assessmentId: assessment.assessmentId,
    view,
    executiveSummary,
    domainResults,
    controlResults,
    findings,
    eligibility: assessment.eligibility,
    evidenceIndex,
    provenance,
  });

  return {
    reportId,
    assessmentId: assessment.assessmentId,
    view,
    executiveSummary,
    domainResults,
    controlResults,
    findings,
    eligibility: assessment.eligibility,
    evidenceIndex,
    provenance,
    integrity: {
      algorithm: 'sha256',
      canonicalizationVersion: AOC_CANONICALIZATION_VERSION,
      reportDigest,
      assessmentDigest: assessment.integrity.assessmentDigest,
    },
  };
}
