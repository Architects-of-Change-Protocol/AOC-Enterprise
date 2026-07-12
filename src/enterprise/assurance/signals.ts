import { computeDigest } from '../governance-store/digest.js';
import { AssuranceError } from './errors.js';
import type {
  AssuranceAssessment,
  AssuranceFinding,
  AssuranceSignal,
  AssuranceSignalOutcome,
  AssuranceSignalSeverity,
  AssuranceSignalType,
  ContinuousAssuranceState,
  ContinuousAssuranceStateKind,
} from './contracts.js';
import { ASSURANCE_SIGNAL_TYPES } from './contracts.js';

/**
 * Continuous Assurance signals (mission sections 41-45). Signals are
 * append-only observations that a completed assessment MAY no longer
 * represent current conditions. A signal never rewrites a completed
 * assessment: staleness and the continuous state are always *derived* from
 * the immutable assessment history plus appended signals -- there is no
 * mutable "current state" row anywhere.
 */

/** Deterministic default severity per signal type. */
export const ASSURANCE_SIGNAL_SEVERITIES: Readonly<Record<AssuranceSignalType, AssuranceSignalSeverity>> = {
  governance_decision_denied: 'informational',
  governance_integrity_failed: 'critical',
  evidence_bundle_verification_failed: 'high',
  passport_suspended: 'high',
  passport_revoked: 'critical',
  passport_integrity_failed: 'critical',
  enterprise_module_unhealthy: 'medium',
  enterprise_readiness_lost: 'high',
  control_evidence_expired: 'medium',
  control_evidence_missing: 'medium',
  finding_reopened: 'high',
  remediation_evidence_added: 'informational',
  framework_version_changed: 'medium',
};

/** Deterministic processing outcomes per signal type (mission section 43). */
export const ASSURANCE_SIGNAL_OUTCOMES: Readonly<Record<AssuranceSignalType, readonly AssuranceSignalOutcome[]>> = {
  governance_decision_denied: ['record_only'],
  governance_integrity_failed: ['mark_assessment_stale', 'require_manual_review'],
  evidence_bundle_verification_failed: ['mark_assessment_stale'],
  passport_suspended: ['mark_assessment_stale'],
  passport_revoked: ['mark_assessment_stale', 'change_eligibility', 'request_reassessment'],
  passport_integrity_failed: ['mark_assessment_stale', 'require_manual_review'],
  enterprise_module_unhealthy: ['mark_assessment_stale'],
  enterprise_readiness_lost: ['mark_assessment_stale'],
  control_evidence_expired: ['mark_assessment_stale'],
  control_evidence_missing: ['open_finding'],
  finding_reopened: ['reopen_finding', 'mark_assessment_stale'],
  remediation_evidence_added: ['record_only'],
  framework_version_changed: ['mark_assessment_stale', 'request_reassessment'],
};

export function isAssuranceSignalType(value: string): value is AssuranceSignalType {
  return (ASSURANCE_SIGNAL_TYPES as readonly string[]).includes(value);
}

export interface BuildAssuranceSignalInput {
  readonly signalId: string;
  readonly organizationId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly signalType: AssuranceSignalType;
  readonly severity?: AssuranceSignalSeverity;
  readonly sourceType: AssuranceSignal['sourceType'];
  readonly sourceId: string;
  readonly sourceDigest?: string;
  readonly affectedControlIds?: readonly string[];
  readonly affectedDomainIds?: readonly string[];
  readonly occurredAt: string;
  readonly observedAt: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export function buildAssuranceSignal(input: BuildAssuranceSignalInput): AssuranceSignal {
  if (!isAssuranceSignalType(input.signalType)) {
    throw new AssuranceError('ASSURANCE_SIGNAL_INVALID', `Unsupported Assurance signal type '${String(input.signalType)}'.`);
  }
  const payload = input.payload ?? {};
  const severity = input.severity ?? ASSURANCE_SIGNAL_SEVERITIES[input.signalType];
  const signalDigest = computeDigest({
    signalId: input.signalId,
    organizationId: input.organizationId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    signalType: input.signalType,
    severity,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceDigest: input.sourceDigest ?? null,
    occurredAt: input.occurredAt,
    payload,
  });
  return {
    signalId: input.signalId,
    organizationId: input.organizationId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    signalType: input.signalType,
    severity,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    ...(input.sourceDigest !== undefined ? { sourceDigest: input.sourceDigest } : {}),
    affectedControlIds: input.affectedControlIds ?? [],
    affectedDomainIds: input.affectedDomainIds ?? [],
    occurredAt: input.occurredAt,
    observedAt: input.observedAt,
    payload,
    signalDigest,
  };
}

/** Signal types whose outcomes include marking the subject's assessment stale. */
const STALE_MARKING_OUTCOME: AssuranceSignalOutcome = 'mark_assessment_stale';

/** True when `signal` post-dates `assessment`'s completion and therefore bears on whether that assessment still represents current conditions. */
export function signalAffectsAssessment(signal: AssuranceSignal, assessment: AssuranceAssessment): boolean {
  if (signal.subjectId !== assessment.subject.subjectId && signal.subjectId !== assessment.subject.passportId) return false;
  if (signal.organizationId !== assessment.subject.organizationId) return false;
  const completedAt = assessment.completedAt ?? assessment.createdAt;
  return Date.parse(signal.observedAt) >= Date.parse(completedAt);
}

/** Deterministic staleness derivation (mission section 45). Stale never means failed -- it means the prior result may no longer represent current conditions. */
export function deriveStaleReasons(assessment: AssuranceAssessment, signals: readonly AssuranceSignal[]): readonly string[] {
  const reasons: string[] = [];
  for (const signal of signals) {
    if (!signalAffectsAssessment(signal, assessment)) continue;
    if (ASSURANCE_SIGNAL_OUTCOMES[signal.signalType].includes(STALE_MARKING_OUTCOME)) {
      reasons.push(`signal '${signal.signalId}' (${signal.signalType}) observed at ${signal.observedAt}`);
    }
  }
  return reasons;
}

export interface DeriveContinuousStateInput {
  readonly subjectId: string;
  readonly frameworkId: string;
  readonly frameworkVersion: string;
  readonly latestCompletedAssessment?: AssuranceAssessment;
  readonly openFindings: readonly AssuranceFinding[];
  readonly signals: readonly AssuranceSignal[];
  readonly now: () => string;
}

/**
 * Derives the continuous Assurance state (mission section 44) from
 * immutable inputs. Priority: critical > degraded > stale > current;
 * `unknown` when no completed assessment exists.
 */
export function deriveContinuousAssuranceState(input: DeriveContinuousStateInput): ContinuousAssuranceState {
  const { latestCompletedAssessment: latest } = input;

  const activeSignals = latest === undefined ? input.signals : input.signals.filter((signal) => signalAffectsAssessment(signal, latest));
  const staleReasons = latest === undefined ? [] : deriveStaleReasons(latest, input.signals);

  const openFindingCounts: Record<string, number> = {};
  for (const finding of input.openFindings) {
    openFindingCounts[finding.severity] = (openFindingCounts[finding.severity] ?? 0) + 1;
  }

  let state: ContinuousAssuranceStateKind;
  if (latest === undefined) {
    state = 'unknown';
  } else if (activeSignals.some((signal) => signal.severity === 'critical') || input.openFindings.some((finding) => finding.severity === 'critical')) {
    state = 'critical';
  } else if (activeSignals.some((signal) => signal.severity === 'high') || input.openFindings.some((finding) => finding.severity === 'high')) {
    state = 'degraded';
  } else if (staleReasons.length > 0) {
    state = 'stale';
  } else {
    state = 'current';
  }

  const eligibilityChanged = activeSignals.some((signal) => ASSURANCE_SIGNAL_OUTCOMES[signal.signalType].includes('change_eligibility'));
  const eligibleProfiles = (latest?.eligibility ?? []).filter((result) => result.eligible).map((result) => result.profileId);
  const eligibilityState = latest === undefined ? undefined : eligibilityChanged ? 'suspended_by_signal' : eligibleProfiles.length > 0 ? eligibleProfiles.join(',') : 'none';

  return {
    subjectId: input.subjectId,
    frameworkId: input.frameworkId,
    frameworkVersion: input.frameworkVersion,
    ...(latest !== undefined ? { latestCompletedAssessmentId: latest.assessmentId } : {}),
    state,
    openFindingCounts,
    activeSignalIds: activeSignals.map((signal) => signal.signalId),
    ...(eligibilityState !== undefined ? { eligibilityState } : {}),
    staleReasons,
    updatedAt: input.now(),
  };
}
