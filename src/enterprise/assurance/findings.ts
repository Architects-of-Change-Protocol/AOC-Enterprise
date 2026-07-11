import { computeDigest } from '../governance-store/digest.js';
import { AssuranceError } from './errors.js';
import type {
  AssuranceControlDefinition,
  AssuranceControlEvaluation,
  AssuranceControlStatus,
  AssuranceDomainDefinition,
  AssuranceFinding,
  AssuranceFindingEvent,
  AssuranceFindingEventType,
  AssuranceFindingSeverity,
  AssuranceFindingStatus,
  AssuranceFindingType,
  AssuranceFramework,
  AssuranceRemediationGuidance,
} from './contracts.js';

/**
 * The Assurance Findings engine (mission sections 22-25). Findings are
 * derived deterministically from control evaluations by framework-defined
 * rules; their lifecycle is append-only events -- history is never
 * overwritten, and a later passing assessment never silently closes an
 * earlier finding (closure is an explicit, attributable event).
 */

// ---------------------------------------------------------------------------
// Severity rules (mission section 23) -- rule-based, never arbitrary.
// ---------------------------------------------------------------------------

/**
 * Default severity when the control defines no explicit `severityMapping`:
 * derived from control criticality, blocking status, and the degraded
 * status kind. Documented in `docs/enterprise/AOC_ASSURANCE_FINDINGS.md`.
 */
export function deriveFindingSeverity(
  control: AssuranceControlDefinition,
  status: AssuranceControlStatus,
  isBlockingControl: boolean,
): AssuranceFindingSeverity {
  const mapped = control.severityMapping?.[status];
  if (mapped !== undefined) return mapped;

  if (status === 'fail') {
    if (isBlockingControl) return 'critical';
    if (control.criticality === 'mandatory') return 'high';
    if (control.criticality === 'recommended') return 'medium';
    return 'low';
  }
  if (status === 'partial') {
    if (control.criticality === 'mandatory') return 'medium';
    return 'low';
  }
  if (status === 'unknown') {
    if (control.criticality === 'mandatory') return isBlockingControl ? 'high' : 'medium';
    return 'low';
  }
  // manual_review_required findings are informational trackers of pending work.
  return 'informational';
}

function findingTypeForStatus(status: AssuranceControlStatus, reasonCodes: readonly string[]): AssuranceFindingType {
  if (reasonCodes.includes('CONTROL_EVIDENCE_CONTRADICTORY') || reasonCodes.includes('EVIDENCE_DIGEST_MISMATCH')) return 'integrity_issue';
  if (status === 'fail') return 'control_failure';
  if (status === 'manual_review_required') return 'manual_review';
  return 'evidence_gap';
}

const DEFAULT_PRIORITY_BY_SEVERITY: Record<AssuranceFindingSeverity, AssuranceRemediationGuidance['priority']> = {
  critical: 'immediate',
  high: 'high',
  medium: 'normal',
  low: 'low',
  informational: 'low',
};

function buildRemediation(control: AssuranceControlDefinition, status: AssuranceControlStatus, severity: AssuranceFindingSeverity): AssuranceRemediationGuidance {
  const requiredEvidence = control.evidenceRequirementIds.map((requirementId) => `Accepted evidence satisfying requirement '${requirementId}'.`);
  const recommendedActions =
    control.remediationGuidance !== undefined
      ? [control.remediationGuidance]
      : status === 'manual_review_required'
        ? [`Complete an attributable manual review for control '${control.controlId}'.`]
        : status === 'unknown'
          ? [`Produce and verify the missing evidence for control '${control.controlId}'.`]
          : [`Remediate the control gap and re-collect evidence for control '${control.controlId}'.`];
  return {
    objective: control.objective,
    recommendedActions,
    requiredEvidence,
    priority: DEFAULT_PRIORITY_BY_SEVERITY[severity],
  };
}

/** Which control statuses produce a finding. `pass` and `not_applicable` never do. */
const FINDING_STATUSES: readonly AssuranceControlStatus[] = ['fail', 'partial', 'unknown', 'manual_review_required'];

export interface DeriveFindingsInput {
  readonly framework: AssuranceFramework;
  readonly evaluations: readonly AssuranceControlEvaluation[];
  readonly assessmentId: string;
  readonly nextId: (prefix: string) => string;
  readonly now: () => string;
}

export function deriveFindingsFromEvaluations(input: DeriveFindingsInput): readonly AssuranceFinding[] {
  const controlsById = new Map<string, AssuranceControlDefinition>(input.framework.controls.map((control) => [control.controlId, control]));
  const domainsById = new Map<string, AssuranceDomainDefinition>(input.framework.domains.map((domain) => [domain.domainId, domain]));

  const findings: AssuranceFinding[] = [];
  for (const evaluation of input.evaluations) {
    if (!FINDING_STATUSES.includes(evaluation.status)) continue;
    const control = controlsById.get(evaluation.controlId);
    if (control === undefined) continue;
    const domain = domainsById.get(evaluation.domainId);
    const isBlocking = domain?.blockingControlIds?.includes(evaluation.controlId) === true;
    const severity = deriveFindingSeverity(control, evaluation.status, isBlocking);
    const findingType = findingTypeForStatus(evaluation.status, evaluation.reasonCodes);

    findings.push({
      findingId: input.nextId('assurance-finding'),
      assessmentId: input.assessmentId,
      controlId: evaluation.controlId,
      domainId: evaluation.domainId,
      findingType,
      severity,
      status: 'open',
      title: `${control.title}: ${evaluation.status.replace(/_/g, ' ')}`,
      description: evaluation.summary,
      reasonCodes: evaluation.reasonCodes,
      evidenceReferenceIds: evaluation.evidenceReferenceIds,
      remediation: buildRemediation(control, evaluation.status, severity),
      createdAt: input.now(),
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Finding lifecycle (append-only events; mission section 24)
// ---------------------------------------------------------------------------

const FINDING_TRANSITIONS: Readonly<Record<AssuranceFindingEventType, { readonly from: readonly (AssuranceFindingStatus | undefined)[]; readonly to: AssuranceFindingStatus }>> = {
  AssuranceFindingCreated: { from: [undefined], to: 'open' },
  AssuranceFindingAccepted: { from: ['open'], to: 'accepted' },
  AssuranceRemediationPlanned: { from: ['open', 'accepted'], to: 'remediation_planned' },
  AssuranceFindingRemediated: { from: ['open', 'accepted', 'remediation_planned'], to: 'remediated' },
  AssuranceFindingClosed: { from: ['remediated', 'accepted'], to: 'closed' },
  AssuranceFindingSuperseded: { from: ['open', 'accepted', 'remediation_planned', 'remediated'], to: 'superseded' },
  AssuranceFindingReopened: { from: ['closed', 'remediated', 'superseded'], to: 'open' },
};

export function applyFindingTransition(current: AssuranceFindingStatus | undefined, eventType: AssuranceFindingEventType): AssuranceFindingStatus {
  const rule = FINDING_TRANSITIONS[eventType];
  if (!rule.from.includes(current)) {
    throw new AssuranceError(
      'ASSURANCE_INVALID_FINDING_TRANSITION',
      `Finding event '${eventType}' is not valid from status '${current ?? 'none'}' (valid from: ${rule.from.map((status) => status ?? 'none').join(', ')}).`,
    );
  }
  return rule.to;
}

/** Folds an ordered append-only event history into the finding's current status. */
export function foldFindingStatus(events: readonly AssuranceFindingEvent[]): AssuranceFindingStatus | undefined {
  let status: AssuranceFindingStatus | undefined;
  for (const event of events) {
    status = applyFindingTransition(status, event.eventType);
  }
  return status;
}

export interface BuildFindingEventInput {
  readonly findingEventId: string;
  readonly findingId: string;
  readonly assessmentId: string;
  readonly organizationId: string;
  readonly eventType: AssuranceFindingEventType;
  readonly sequence: number;
  readonly actorId: string;
  readonly rationale?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export function buildFindingEvent(input: BuildFindingEventInput): AssuranceFindingEvent {
  const payload = input.payload ?? {};
  const eventDigest = computeDigest({
    findingEventId: input.findingEventId,
    findingId: input.findingId,
    assessmentId: input.assessmentId,
    organizationId: input.organizationId,
    eventType: input.eventType,
    sequence: input.sequence,
    actorId: input.actorId,
    rationale: input.rationale ?? null,
    payload,
    occurredAt: input.occurredAt,
  });
  return {
    findingEventId: input.findingEventId,
    findingId: input.findingId,
    assessmentId: input.assessmentId,
    organizationId: input.organizationId,
    eventType: input.eventType,
    sequence: input.sequence,
    actorId: input.actorId,
    ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
    payload,
    occurredAt: input.occurredAt,
    eventDigest,
  };
}
