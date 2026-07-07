import type { AuditEvent, AuditEventType } from '../../recognition-runtime/domain/audit-event.js';
import type { AuthorityEvent, AuthorityEventType } from '../../authority-graph/domain/authority-event.js';
import type { ApprovalEvent, ApprovalEventType } from '../../approval-runtime/domain/approval-event.js';
import type { HandshakeEvent, HandshakeEventType } from '../../external-agent-handshake/domain/handshake-event.js';
import type { EnforcementEvent, EnforcementEventType } from '../../action-enforcement/domain/enforcement-event.js';
import type { AocTimelineItem } from '../domain/control-plane-timeline.js';
import type { AocTimelineStatus } from '../domain/control-plane-status.js';

export interface TimelineSourceEvents {
  readonly recognitionEvents: readonly AuditEvent[];
  readonly authorityEvents: readonly AuthorityEvent[];
  readonly approvalEvents: readonly ApprovalEvent[];
  readonly handshakeEvents: readonly HandshakeEvent[];
  readonly enforcementEvents: readonly EnforcementEvent[];
}

function titleCase(eventType: string): string {
  return eventType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const RECOGNITION_STATUS: Readonly<Record<AuditEventType, AocTimelineStatus>> = {
  actor_registered: 'info',
  actor_status_changed: 'warning',
  trust_domain_created: 'info',
  passport_issued: 'success',
  passport_suspended: 'warning',
  passport_revoked: 'danger',
  capability_token_issued: 'success',
  capability_token_suspended: 'warning',
  capability_token_revoked: 'danger',
  recognition_decision: 'info',
};

const AUTHORITY_STATUS: Readonly<Record<AuthorityEventType, AocTimelineStatus>> = {
  authority_grant_issued: 'success',
  authority_grant_revoked: 'danger',
  authority_grant_suspended: 'warning',
  authority_grant_expired: 'warning',
  delegation_grant_issued: 'success',
  delegation_grant_revoked: 'danger',
  delegation_grant_suspended: 'warning',
  delegation_grant_expired: 'warning',
  authority_chain_resolved: 'info',
  authority_chain_valid: 'success',
  authority_chain_invalid: 'danger',
  authority_proof_created: 'info',
};

const APPROVAL_STATUS: Readonly<Record<ApprovalEventType, AocTimelineStatus>> = {
  approval_requested: 'warning',
  approvers_resolved: 'info',
  approval_approved: 'success',
  approval_rejected: 'danger',
  approval_changes_requested: 'warning',
  approval_escalated: 'warning',
  approval_expired: 'warning',
  approval_revoked: 'danger',
  approval_proof_created: 'info',
  approval_verified: 'success',
  approval_verification_failed: 'danger',
};

const HANDSHAKE_STATUS: Readonly<Record<HandshakeEventType, AocTimelineStatus>> = {
  handshake_submitted: 'info',
  handshake_challenge_issued: 'info',
  handshake_challenge_answered: 'info',
  handshake_verification_started: 'info',
  handshake_accepted: 'success',
  handshake_accepted_limited: 'success',
  handshake_requires_approval: 'warning',
  handshake_rejected: 'danger',
  handshake_quarantined: 'danger',
  handshake_expired: 'warning',
  handshake_revoked: 'danger',
  agent_visa_issued: 'success',
  agent_visa_expired: 'warning',
  agent_visa_revoked: 'danger',
  ingress_grant_issued: 'success',
  ingress_grant_revoked: 'danger',
  handshake_proof_created: 'info',
  external_standing_evaluated: 'info',
};

const ENFORCEMENT_STATUS: Readonly<Record<EnforcementEventType, AocTimelineStatus>> = {
  enforcement_requested: 'info',
  preflight_started: 'info',
  preflight_passed: 'success',
  preflight_failed: 'danger',
  execution_blocked: 'danger',
  execution_started: 'info',
  execution_succeeded: 'success',
  execution_failed: 'danger',
  execution_skipped: 'warning',
  duplicate_suppressed: 'warning',
  side_effect_planned: 'info',
  side_effect_blocked: 'danger',
  side_effect_executed: 'success',
  enforcement_proof_created: 'info',
  enforcement_violation_recorded: 'danger',
  policy_pack_evaluated: 'info',
  policy_pack_blocked: 'danger',
  policy_pack_warning_recorded: 'warning',
};

function normalizeRecognitionEvent(event: AuditEvent): AocTimelineItem {
  return {
    id: event.id,
    source: 'recognition',
    type: event.eventType,
    title: titleCase(event.eventType),
    description: `Actor ${event.actorId} in trust domain ${event.trustDomainId}.`,
    actorId: event.actorId,
    status: RECOGNITION_STATUS[event.eventType],
    timestamp: event.timestamp,
    ...(event.decisionId !== undefined ? { relatedDecisionId: event.decisionId } : {}),
    metadata: event.payload,
  };
}

function normalizeAuthorityEvent(event: AuthorityEvent): AocTimelineItem {
  return {
    id: event.id,
    source: 'authority',
    type: event.type,
    title: titleCase(event.type),
    description: `Authority event in trust domain ${event.trustDomainId}.`,
    status: AUTHORITY_STATUS[event.type],
    timestamp: event.timestamp,
    ...(event.actorId !== undefined ? { actorId: event.actorId } : {}),
    ...(event.authorityDecisionId !== undefined ? { relatedDecisionId: event.authorityDecisionId } : {}),
    ...(event.authorityProofId !== undefined ? { relatedProofId: event.authorityProofId } : {}),
    metadata: event.payload,
  };
}

function normalizeApprovalEvent(event: ApprovalEvent): AocTimelineItem {
  return {
    id: event.id,
    source: 'approval',
    type: event.type,
    title: titleCase(event.type),
    description: `Approval event in trust domain ${event.trustDomainId}.`,
    status: APPROVAL_STATUS[event.type],
    timestamp: event.timestamp,
    ...(event.actorId !== undefined ? { actorId: event.actorId } : {}),
    ...(event.approvalDecisionId !== undefined ? { relatedDecisionId: event.approvalDecisionId } : {}),
    ...(event.approvalProofId !== undefined ? { relatedProofId: event.approvalProofId } : {}),
    metadata: event.payload,
  };
}

function normalizeHandshakeEvent(event: HandshakeEvent): AocTimelineItem {
  return {
    id: event.id,
    source: 'handshake',
    type: event.type,
    title: titleCase(event.type),
    description: `Handshake event in trust domain ${event.localTrustDomainId}.`,
    status: HANDSHAKE_STATUS[event.type],
    timestamp: event.timestamp,
    ...(event.externalAgentId !== undefined ? { actorId: event.externalAgentId } : {}),
    ...(event.handshakeDecisionId !== undefined ? { relatedDecisionId: event.handshakeDecisionId } : {}),
    ...(event.handshakeProofId !== undefined ? { relatedProofId: event.handshakeProofId } : {}),
    metadata: event.payload,
  };
}

function normalizeEnforcementEvent(event: EnforcementEvent): AocTimelineItem {
  return {
    id: event.id,
    source: 'enforcement',
    type: event.type,
    title: titleCase(event.type),
    description: `Enforcement event in trust domain ${event.trustDomainId}.`,
    status: ENFORCEMENT_STATUS[event.type],
    timestamp: event.timestamp,
    ...(event.actorId !== undefined ? { actorId: event.actorId } : {}),
    ...(event.enforcementDecisionId !== undefined ? { relatedDecisionId: event.enforcementDecisionId } : {}),
    ...(event.enforcementProofId !== undefined ? { relatedProofId: event.enforcementProofId } : {}),
    metadata: event.payload,
  };
}

function compareTimelineItems(a: AocTimelineItem, b: AocTimelineItem): number {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp < b.timestamp ? 1 : -1;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Merges AuditEvents/AuthorityEvents/ApprovalEvents/HandshakeEvents/
 * EnforcementEvents from the five runtimes into one normalized, deterministic
 * timeline, sorted newest-first. Every item traces back to a real event
 * recorded by its owning runtime -- nothing here is invented.
 */
export function buildTimeline(events: TimelineSourceEvents): AocTimelineItem[] {
  const items: AocTimelineItem[] = [
    ...events.recognitionEvents.map(normalizeRecognitionEvent),
    ...events.authorityEvents.map(normalizeAuthorityEvent),
    ...events.approvalEvents.map(normalizeApprovalEvent),
    ...events.handshakeEvents.map(normalizeHandshakeEvent),
    ...events.enforcementEvents.map(normalizeEnforcementEvent),
  ];
  return items.sort(compareTimelineItems);
}
