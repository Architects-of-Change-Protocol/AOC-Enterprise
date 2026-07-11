import { AgentPassportError } from './errors.js';
import { AGENT_PASSPORT_TERMINAL_STATUSES, type AgentPassportEventType, type AgentPassportStatus } from './contracts.js';

/**
 * The Agent Passport lifecycle state machine (mission section 5):
 *
 * ```
 * draft -> active
 * active -> suspended | revoked | expired | retired
 * suspended -> active | revoked | expired | retired
 * revoked | expired | retired -> (terminal; no further transitions)
 * ```
 *
 * A revoked Passport is never reactivated in v1 -- a new Passport version or
 * a new Passport must be issued instead. This module is the single source
 * of truth for which lifecycle events are valid from which status; both
 * `reconstruction.ts` (folding events) and `service.ts` (appending new
 * events) consult it so the two can never disagree.
 */
interface LifecycleTransitionRule {
  readonly from: readonly AgentPassportStatus[];
  readonly to: AgentPassportStatus;
}

const LIFECYCLE_TRANSITIONS: Readonly<Record<AgentPassportEventType, LifecycleTransitionRule | undefined>> = {
  AgentPassportCreated: { from: [], to: 'draft' },
  AgentPassportActivated: { from: ['draft'], to: 'active' },
  AgentPassportSuspended: { from: ['active'], to: 'suspended' },
  AgentPassportReactivated: { from: ['suspended'], to: 'active' },
  AgentPassportRevoked: { from: ['draft', 'active', 'suspended'], to: 'revoked' },
  AgentPassportExpired: { from: ['draft', 'active', 'suspended'], to: 'expired' },
  AgentPassportRetired: { from: ['active', 'suspended'], to: 'retired' },
  AgentCapabilityReferenced: undefined,
  AgentCapabilityReferenceRemoved: undefined,
  AgentAuthorityReferenced: undefined,
  AgentAuthorityReferenceRemoved: undefined,
  AgentDelegationReferenced: undefined,
  AgentDelegationReferenceRemoved: undefined,
  GovernanceRecordLinked: undefined,
  EvidenceBundleLinked: undefined,
  PassportDisclosureViewGenerated: undefined,
  PassportVerificationCompleted: undefined,
};

/** Event types that carry a lifecycle status transition. Every other event type is a reference/observability event that leaves `status` untouched. */
const LIFECYCLE_EVENT_TYPES: ReadonlySet<AgentPassportEventType> = new Set(
  (Object.keys(LIFECYCLE_TRANSITIONS) as AgentPassportEventType[]).filter((key) => LIFECYCLE_TRANSITIONS[key] !== undefined),
);

export function isLifecycleEventType(eventType: AgentPassportEventType): boolean {
  return LIFECYCLE_EVENT_TYPES.has(eventType);
}

export function isTerminalStatus(status: AgentPassportStatus): boolean {
  return AGENT_PASSPORT_TERMINAL_STATUSES.includes(status);
}

/**
 * Validates that `eventType` may legally be appended given `currentStatus`
 * (`undefined` for a brand-new Passport, before any event exists), and
 * returns the resulting status. Throws `PASSPORT_INVALID_STATE_TRANSITION`
 * for a disallowed transition, and the more specific
 * `PASSPORT_ALREADY_REVOKED` when the current status is already terminal
 * (mission section 5: "Do not reactivate a revoked Passport").
 */
export function applyLifecycleTransition(currentStatus: AgentPassportStatus | undefined, eventType: AgentPassportEventType): AgentPassportStatus {
  const rule = LIFECYCLE_TRANSITIONS[eventType];
  if (rule === undefined) {
    if (currentStatus === undefined) {
      throw new AgentPassportError('PASSPORT_INVALID_STATE_TRANSITION', `Event '${eventType}' cannot be the first event on a Passport; a Passport must begin with 'AgentPassportCreated'.`);
    }
    return currentStatus;
  }

  if (eventType === 'AgentPassportCreated') {
    if (currentStatus !== undefined) {
      throw new AgentPassportError('PASSPORT_ALREADY_EXISTS', `'AgentPassportCreated' cannot be appended to a Passport that already has an event history.`);
    }
    return rule.to;
  }

  if (currentStatus === undefined) {
    throw new AgentPassportError('PASSPORT_INVALID_STATE_TRANSITION', `Event '${eventType}' cannot be applied before 'AgentPassportCreated'.`);
  }

  if (currentStatus !== undefined && isTerminalStatus(currentStatus)) {
    throw new AgentPassportError(
      'PASSPORT_ALREADY_REVOKED',
      `Passport is already '${currentStatus}' (terminal); '${eventType}' cannot be applied. Issue a new Passport instead.`,
      { currentStatus },
    );
  }

  if (!rule.from.includes(currentStatus)) {
    throw new AgentPassportError(
      'PASSPORT_INVALID_STATE_TRANSITION',
      `Event '${eventType}' is not valid from status '${currentStatus}'. Valid source statuses: ${rule.from.join(', ') || '(none)'}.`,
      { currentStatus, eventType, validFrom: rule.from },
    );
  }

  return rule.to;
}
