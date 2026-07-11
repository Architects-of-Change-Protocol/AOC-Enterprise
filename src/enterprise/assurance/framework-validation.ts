import type {
  AssuranceControlCriteria,
  AssuranceControlStatus,
  AssuranceFramework,
  AssuranceFrameworkValidationIssue,
  AssuranceFrameworkValidationResult,
} from './contracts.js';
import { ASSURANCE_CONTROL_STATUSES } from './contracts.js';

/**
 * Structural validation of an `AssuranceFramework` (mission section 47).
 * Deliberately pure and deterministic: same framework in, same issues out.
 * An invalid *required* framework fails Assurance module startup -- see
 * `framework-registry.ts` and `modules/assurance-module.ts`.
 */

const WEIGHT_TOLERANCE = 1e-9;

const SUPPORTED_CRITERIA_TYPES = new Set<AssuranceControlCriteria['type']>(['boolean', 'threshold', 'composite', 'evidence_presence', 'manual_review']);

function collectCriteria(criteria: AssuranceControlCriteria, out: AssuranceControlCriteria[]): void {
  out.push(criteria);
  if (criteria.type === 'composite') {
    for (const child of criteria.criteria) collectCriteria(child, out);
  }
}

export function validateAssuranceFramework(framework: AssuranceFramework): AssuranceFrameworkValidationResult {
  const issues: AssuranceFrameworkValidationIssue[] = [];
  const issue = (check: string, message: string): void => {
    issues.push({ check, message });
  };

  if (framework.frameworkId.length === 0) issue('framework.id', 'frameworkId must be a non-empty string.');
  if (framework.frameworkVersion.length === 0) issue('framework.version', 'frameworkVersion must be a non-empty string.');

  // -- Domains ---------------------------------------------------------------
  const domainIds = new Set<string>();
  for (const domain of framework.domains) {
    if (domainIds.has(domain.domainId)) issue('domain.unique', `Duplicate domainId '${domain.domainId}'.`);
    domainIds.add(domain.domainId);
    if (!(domain.weight > 0)) issue('domain.weight', `Domain '${domain.domainId}' weight must be > 0 (got ${domain.weight}).`);
    if (domain.minimumScore !== undefined && (domain.minimumScore < 0 || domain.minimumScore > 100)) {
      issue('domain.minimumScore', `Domain '${domain.domainId}' minimumScore must be within 0..100.`);
    }
    const seenControls = new Set<string>();
    for (const controlId of domain.controlIds) {
      if (seenControls.has(controlId)) issue('domain.controls.unique', `Domain '${domain.domainId}' lists controlId '${controlId}' more than once.`);
      seenControls.add(controlId);
    }
  }
  if (framework.domains.length === 0) issue('domain.present', 'A framework must define at least one domain.');

  const totalDomainWeight = framework.domains.reduce((sum, domain) => sum + domain.weight, 0);
  if (framework.domains.length > 0 && Math.abs(totalDomainWeight - 1) > WEIGHT_TOLERANCE) {
    issue('domain.weights.total', `Domain weights must sum to 1 on the framework's documented scale (got ${totalDomainWeight}).`);
  }

  // -- Evidence requirements ---------------------------------------------------
  const requirementIds = new Set<string>();
  for (const requirement of framework.evidenceRequirements) {
    if (requirementIds.has(requirement.requirementId)) issue('requirement.unique', `Duplicate evidence requirementId '${requirement.requirementId}'.`);
    requirementIds.add(requirement.requirementId);
    if (requirement.acceptedEvidenceTypes.length === 0) {
      issue('requirement.types', `Evidence requirement '${requirement.requirementId}' must accept at least one evidence type.`);
    }
    if (requirement.minimumCount !== undefined && requirement.minimumCount < 1) {
      issue('requirement.minimumCount', `Evidence requirement '${requirement.requirementId}' minimumCount must be >= 1.`);
    }
    if (requirement.maximumAgeDays !== undefined && requirement.maximumAgeDays <= 0) {
      issue('requirement.maximumAgeDays', `Evidence requirement '${requirement.requirementId}' maximumAgeDays must be > 0.`);
    }
  }

  // -- Controls ----------------------------------------------------------------
  const controlIds = new Set<string>();
  const controlDomainById = new Map<string, string>();
  for (const control of framework.controls) {
    if (controlIds.has(control.controlId)) issue('control.unique', `Duplicate controlId '${control.controlId}'.`);
    controlIds.add(control.controlId);
    controlDomainById.set(control.controlId, control.domainId);

    if (control.frameworkId !== framework.frameworkId || control.frameworkVersion !== framework.frameworkVersion) {
      issue('control.framework-binding', `Control '${control.controlId}' is bound to '${control.frameworkId}@${control.frameworkVersion}', not this framework.`);
    }
    if (!domainIds.has(control.domainId)) {
      issue('control.domain', `Control '${control.controlId}' references unknown domainId '${control.domainId}'.`);
    }
    for (const requirementId of control.evidenceRequirementIds) {
      if (!requirementIds.has(requirementId)) {
        issue('control.requirement', `Control '${control.controlId}' references unknown evidence requirementId '${requirementId}'.`);
      }
    }
    if (!(control.scoring.weight > 0)) issue('control.weight', `Control '${control.controlId}' scoring.weight must be > 0.`);
    if (!(control.scoring.maximumScore > 0)) issue('control.maximumScore', `Control '${control.controlId}' scoring.maximumScore must be > 0.`);

    const allCriteria: AssuranceControlCriteria[] = [];
    collectCriteria(control.criteria, allCriteria);
    for (const criteria of allCriteria) {
      if (!SUPPORTED_CRITERIA_TYPES.has(criteria.type)) {
        issue('control.criteria.type', `Control '${control.controlId}' uses unsupported criteria type '${String(criteria.type)}'.`);
      }
      if (criteria.type === 'composite') {
        if (criteria.criteria.length === 0) issue('control.criteria.composite', `Control '${control.controlId}' has a composite criteria with no children.`);
        if (criteria.operator === 'minimum' && (criteria.minimum === undefined || criteria.minimum < 1 || criteria.minimum > criteria.criteria.length)) {
          issue('control.criteria.minimum', `Control '${control.controlId}' composite 'minimum' operator requires 1 <= minimum <= ${criteria.criteria.length}.`);
        }
      }
      if (criteria.type === 'evidence_presence') {
        for (const requirementId of criteria.requirementIds) {
          if (!requirementIds.has(requirementId)) {
            issue('control.criteria.requirement', `Control '${control.controlId}' evidence_presence criteria references unknown requirementId '${requirementId}'.`);
          }
        }
        if (criteria.minimumSatisfied < 0 || criteria.minimumSatisfied > criteria.requirementIds.length) {
          issue('control.criteria.minimumSatisfied', `Control '${control.controlId}' evidence_presence minimumSatisfied must be within 0..${criteria.requirementIds.length}.`);
        }
      }
    }
    if (control.criteria.type === 'manual_review' && control.evaluationMethod !== 'manual_review') {
      issue('control.method', `Control '${control.controlId}' uses manual_review criteria but declares evaluationMethod '${control.evaluationMethod}'.`);
    }
  }

  // -- Domain <-> control cross references (no orphans, no dangling ids) --------
  const referencedControls = new Set<string>();
  for (const domain of framework.domains) {
    for (const controlId of domain.controlIds) {
      referencedControls.add(controlId);
      if (!controlIds.has(controlId)) issue('domain.control-reference', `Domain '${domain.domainId}' references unknown controlId '${controlId}'.`);
      const owner = controlDomainById.get(controlId);
      if (owner !== undefined && owner !== domain.domainId) {
        issue('domain.control-ownership', `Control '${controlId}' belongs to domain '${owner}' but is listed under domain '${domain.domainId}'.`);
      }
    }
    for (const blockingId of domain.blockingControlIds ?? []) {
      if (!domain.controlIds.includes(blockingId)) {
        issue('domain.blocking', `Domain '${domain.domainId}' declares blocking control '${blockingId}' that is not one of its controls.`);
      }
    }
  }
  for (const controlId of controlIds) {
    if (!referencedControls.has(controlId)) issue('control.orphan', `Control '${controlId}' is not listed by any domain.`);
  }

  // -- Scoring model -------------------------------------------------------------
  const scoring = framework.scoringModel;
  for (const status of ASSURANCE_CONTROL_STATUSES) {
    if (!(status in scoring.statusScores)) {
      issue('scoring.statusScores', `scoringModel.statusScores is missing an entry for status '${status}'.`);
      continue;
    }
    const value = scoring.statusScores[status as AssuranceControlStatus];
    if (value !== null && (value < 0 || value > 1)) {
      issue('scoring.statusScores.range', `scoringModel.statusScores['${status}'] must be null or within 0..1 (got ${value}).`);
    }
  }
  for (const [domainId, weight] of Object.entries(scoring.domainWeights)) {
    if (!domainIds.has(domainId)) issue('scoring.domainWeights', `scoringModel.domainWeights references unknown domainId '${domainId}'.`);
    if (!(weight > 0)) issue('scoring.domainWeights.value', `scoringModel.domainWeights['${domainId}'] must be > 0.`);
  }
  for (const [controlId, weight] of Object.entries(scoring.controlWeights)) {
    if (!controlIds.has(controlId)) issue('scoring.controlWeights', `scoringModel.controlWeights references unknown controlId '${controlId}'.`);
    if (!(weight > 0)) issue('scoring.controlWeights.value', `scoringModel.controlWeights['${controlId}'] must be > 0.`);
  }

  // -- Eligibility profiles --------------------------------------------------------
  const profileIds = new Set<string>();
  for (const profile of framework.eligibilityProfiles) {
    if (profileIds.has(profile.profileId)) issue('eligibility.unique', `Duplicate eligibility profileId '${profile.profileId}'.`);
    profileIds.add(profile.profileId);
    if (profile.minimumOverallScore !== undefined && (profile.minimumOverallScore < 0 || profile.minimumOverallScore > 100)) {
      issue('eligibility.minimumOverallScore', `Profile '${profile.profileId}' minimumOverallScore must be within 0..100.`);
    }
    for (const [domainId, minimum] of Object.entries(profile.minimumDomainScores ?? {})) {
      if (!domainIds.has(domainId)) issue('eligibility.domain', `Profile '${profile.profileId}' names unknown domainId '${domainId}'.`);
      if (minimum < 0 || minimum > 100) issue('eligibility.domain.range', `Profile '${profile.profileId}' minimum for '${domainId}' must be within 0..100.`);
    }
    for (const controlId of profile.mandatoryControlIds ?? []) {
      if (!controlIds.has(controlId)) issue('eligibility.control', `Profile '${profile.profileId}' names unknown mandatory controlId '${controlId}'.`);
    }
    if (profile.minimumVerifiedEvidenceRate !== undefined && (profile.minimumVerifiedEvidenceRate < 0 || profile.minimumVerifiedEvidenceRate > 1)) {
      issue('eligibility.evidenceRate', `Profile '${profile.profileId}' minimumVerifiedEvidenceRate must be within 0..1.`);
    }
  }

  return {
    frameworkId: framework.frameworkId,
    frameworkVersion: framework.frameworkVersion,
    valid: issues.length === 0,
    issues,
  };
}
