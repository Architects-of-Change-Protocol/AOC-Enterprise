import { AOC_CANONICALIZATION_VERSION } from '../governance-store/canonical-json.js';
import { AgentPassportError } from './errors.js';
import { applyLifecycleTransition, isLifecycleEventType } from './lifecycle.js';
import {
  AGENT_PASSPORT_SCHEMA_VERSION,
  type AgentAuthorityReference,
  type AgentCapabilityReference,
  type AgentDelegationReference,
  type AgentPassport,
  type AgentPassportEvent,
  type AgentPassportHistorySummary,
  type AgentPassportLifecycle,
  type AgentPassportOrganizationBinding,
  type AgentPassportStatus,
  type AgentPassportSubject,
  type PassportEvidenceReference,
  type PassportGovernanceReference,
} from './contracts.js';

/**
 * Folds an ordered `AgentPassportEvent[]` into the current `AgentPassport`
 * read model (mission section 8: "The current Passport state must be
 * reconstructed from ordered events"). This is the only place Passport
 * state is derived -- `service.ts` never assembles a Passport by hand, it
 * always appends an event and reconstructs. Events must already be in
 * ascending `sequence` order and chain-verified by the caller (the Store);
 * this function trusts sequence order but re-derives every other field
 * from payloads, never from a cached projection.
 */

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AgentPassportError('PASSPORT_INTEGRITY_FAILED', `Event payload for '${context}' must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AgentPassportError('PASSPORT_INTEGRITY_FAILED', `Event payload field '${context}' must be a non-empty string.`);
  }
  return value;
}

function asOptionalString(value: unknown, context: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, context);
}

/**
 * Extracts just the fields a Store needs at append time to enforce
 * uniqueness and populate its projection cache -- shared by
 * `in-memory-passport-store.ts` and `sqlite-passport-store.ts` so both
 * validate an `AgentPassportCreated` payload identically.
 */
export function parseCreatedEventPayload(payload: Readonly<Record<string, unknown>>): { readonly agentId: string; readonly agentType: string; readonly passportVersion: string } {
  const subjectRaw = asRecord(payload.subject, 'AgentPassportCreated.subject');
  return {
    agentId: asString(subjectRaw.agentId, 'subject.agentId'),
    agentType: asString(subjectRaw.agentType, 'subject.agentType'),
    passportVersion: asString(payload.passportVersion, 'AgentPassportCreated.passportVersion'),
  };
}

interface ReconstructionState {
  passportVersion: string;
  subject: AgentPassportSubject | undefined;
  organization: AgentPassportOrganizationBinding | undefined;
  status: AgentPassportStatus | undefined;
  lifecycle: AgentPassportLifecycle | undefined;
  capabilities: Map<string, AgentCapabilityReference>;
  authorities: Map<string, AgentAuthorityReference>;
  delegations: Map<string, AgentDelegationReference>;
  governanceReferences: PassportGovernanceReference[];
  evidenceReferences: PassportEvidenceReference[];
  createdBy: string | undefined;
  issuerOrganizationId: string | undefined;
  createdAt: string | undefined;
  activatedEventId: string | undefined;
  sourceIdentityRecord: string | undefined;
}

function applyCreated(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  const subjectRaw = asRecord(payload.subject, `${event.eventType}.subject`);
  const organizationRaw = asRecord(payload.organization, `${event.eventType}.organization`);

  const displayName = asOptionalString(subjectRaw.displayName, 'subject.displayName');
  const description = asOptionalString(subjectRaw.description, 'subject.description');
  const modelProvider = asOptionalString(subjectRaw.modelProvider, 'subject.modelProvider');
  const modelFamily = asOptionalString(subjectRaw.modelFamily, 'subject.modelFamily');
  const systemOwnerId = asOptionalString(subjectRaw.systemOwnerId, 'subject.systemOwnerId');
  const operationalOwnerId = asOptionalString(subjectRaw.operationalOwnerId, 'subject.operationalOwnerId');

  state.passportVersion = asString(payload.passportVersion, `${event.eventType}.passportVersion`);
  state.subject = {
    agentId: asString(subjectRaw.agentId, 'subject.agentId'),
    agentType: asString(subjectRaw.agentType, 'subject.agentType') as AgentPassportSubject['agentType'],
    ...(displayName !== undefined ? { displayName } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(modelProvider !== undefined ? { modelProvider } : {}),
    ...(modelFamily !== undefined ? { modelFamily } : {}),
    ...(systemOwnerId !== undefined ? { systemOwnerId } : {}),
    ...(operationalOwnerId !== undefined ? { operationalOwnerId } : {}),
  };

  const workspaceId = asOptionalString(organizationRaw.workspaceId, 'organization.workspaceId');
  const departmentId = asOptionalString(organizationRaw.departmentId, 'organization.departmentId');
  const recognitionReference = asOptionalString(organizationRaw.recognitionReference, 'organization.recognitionReference');

  const organization = {
    organizationId: asString(organizationRaw.organizationId, 'organization.organizationId'),
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    ...(departmentId !== undefined ? { departmentId } : {}),
    recognizedBy: asString(organizationRaw.recognizedBy, 'organization.recognizedBy'),
    ...(recognitionReference !== undefined ? { recognitionReference } : {}),
    boundAt: asString(organizationRaw.boundAt, 'organization.boundAt'),
  };
  state.organization = organization;
  state.status = 'draft';
  state.lifecycle = { status: 'draft', enteredAt: event.occurredAt };
  state.createdBy = event.actorId;
  state.issuerOrganizationId = organization.organizationId;
  state.createdAt = event.occurredAt;
  state.sourceIdentityRecord = asOptionalString(payload.sourceIdentityRecord, `${event.eventType}.sourceIdentityRecord`);
}

function applyActivated(state: ReconstructionState, event: AgentPassportEvent): void {
  state.status = 'active';
  state.lifecycle = { status: 'active', enteredAt: event.occurredAt, activatedAt: event.occurredAt };
  state.activatedEventId = event.eventId;
}

function applySuspended(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  const activatedAt = state.lifecycle?.activatedAt;
  const suspendedReason = asOptionalString(payload.reason, 'reason');
  const expectedReviewAt = asOptionalString(payload.expectedReviewAt, 'expectedReviewAt');
  state.status = 'suspended';
  state.lifecycle = {
    status: 'suspended',
    enteredAt: event.occurredAt,
    ...(activatedAt !== undefined ? { activatedAt } : {}),
    suspendedAt: event.occurredAt,
    ...(suspendedReason !== undefined ? { suspendedReason } : {}),
    suspendedBy: asString(payload.suspendedBy, 'suspendedBy'),
    ...(expectedReviewAt !== undefined ? { expectedReviewAt } : {}),
  };
}

function applyReactivated(state: ReconstructionState, event: AgentPassportEvent): void {
  state.status = 'active';
  state.lifecycle = {
    status: 'active',
    enteredAt: event.occurredAt,
    activatedAt: event.occurredAt,
  };
}

function applyRevoked(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  const activatedAt = state.lifecycle?.activatedAt;
  state.status = 'revoked';
  state.lifecycle = {
    status: 'revoked',
    enteredAt: event.occurredAt,
    ...(activatedAt !== undefined ? { activatedAt } : {}),
    revokedAt: event.occurredAt,
    revokedReason: asString(payload.reason, 'reason'),
    revokedReasonCode: asString(payload.reasonCode, 'reasonCode'),
    revokedBy: asString(payload.revokedBy, 'revokedBy'),
  };
}

function applyExpired(state: ReconstructionState, event: AgentPassportEvent): void {
  const activatedAt = state.lifecycle?.activatedAt;
  state.status = 'expired';
  state.lifecycle = {
    status: 'expired',
    enteredAt: event.occurredAt,
    ...(activatedAt !== undefined ? { activatedAt } : {}),
    expiredAt: event.occurredAt,
  };
}

function applyRetired(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  const activatedAt = state.lifecycle?.activatedAt;
  const retiredReason = asOptionalString(payload.reason, 'reason');
  state.status = 'retired';
  state.lifecycle = {
    status: 'retired',
    enteredAt: event.occurredAt,
    ...(activatedAt !== undefined ? { activatedAt } : {}),
    retiredAt: event.occurredAt,
    ...(retiredReason !== undefined ? { retiredReason } : {}),
    retiredBy: asString(payload.retiredBy, 'retiredBy'),
  };
}

function applyCapabilityReferenced(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  const reference = payload.reference as AgentCapabilityReference;
  state.capabilities.set(reference.capabilityId, reference);
}

function applyCapabilityReferenceRemoved(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  state.capabilities.delete(asString(payload.capabilityId, 'capabilityId'));
}

function applyAuthorityReferenced(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  const reference = payload.reference as AgentAuthorityReference;
  state.authorities.set(reference.authorityId, reference);
}

function applyAuthorityReferenceRemoved(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  state.authorities.delete(asString(payload.authorityId, 'authorityId'));
}

function applyDelegationReferenced(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  const reference = payload.reference as AgentDelegationReference;
  state.delegations.set(reference.delegationId, reference);
}

function applyDelegationReferenceRemoved(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  state.delegations.delete(asString(payload.delegationId, 'delegationId'));
}

function applyGovernanceRecordLinked(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  state.governanceReferences.push(payload.reference as PassportGovernanceReference);
}

function applyEvidenceBundleLinked(state: ReconstructionState, event: AgentPassportEvent): void {
  const payload = asRecord(event.payload, event.eventType);
  state.evidenceReferences.push(payload.reference as PassportEvidenceReference);
}

/**
 * Folds `events` (already ordered ascending by `sequence`) into an
 * `AgentPassport`. Throws `AgentPassportError` (`PASSPORT_NOT_FOUND` on an
 * empty list, `PASSPORT_INTEGRITY_FAILED` on a malformed payload or an
 * event ordering the lifecycle state machine rejects) rather than
 * returning a partially-built Passport.
 */
export function reconstructAgentPassportFromEvents(passportId: string, events: readonly AgentPassportEvent[]): AgentPassport {
  if (events.length === 0) {
    throw new AgentPassportError('PASSPORT_NOT_FOUND', `No events for passportId '${passportId}'.`);
  }

  const state: ReconstructionState = {
    passportVersion: '',
    subject: undefined,
    organization: undefined,
    status: undefined,
    lifecycle: undefined,
    capabilities: new Map(),
    authorities: new Map(),
    delegations: new Map(),
    governanceReferences: [],
    evidenceReferences: [],
    createdBy: undefined,
    issuerOrganizationId: undefined,
    createdAt: undefined,
    activatedEventId: undefined,
    sourceIdentityRecord: undefined,
  };

  let lastEvent: AgentPassportEvent | undefined;
  for (const event of events) {
    if (event.passportId !== passportId) {
      throw new AgentPassportError('PASSPORT_INTEGRITY_FAILED', `Event '${event.eventId}' belongs to passportId '${event.passportId}', not '${passportId}'.`);
    }

    if (isLifecycleEventType(event.eventType)) {
      state.status = applyLifecycleTransition(state.status, event.eventType);
    }

    switch (event.eventType) {
      case 'AgentPassportCreated':
        applyCreated(state, event);
        break;
      case 'AgentPassportActivated':
        applyActivated(state, event);
        break;
      case 'AgentPassportSuspended':
        applySuspended(state, event);
        break;
      case 'AgentPassportReactivated':
        applyReactivated(state, event);
        break;
      case 'AgentPassportRevoked':
        applyRevoked(state, event);
        break;
      case 'AgentPassportExpired':
        applyExpired(state, event);
        break;
      case 'AgentPassportRetired':
        applyRetired(state, event);
        break;
      case 'AgentCapabilityReferenced':
        applyCapabilityReferenced(state, event);
        break;
      case 'AgentCapabilityReferenceRemoved':
        applyCapabilityReferenceRemoved(state, event);
        break;
      case 'AgentAuthorityReferenced':
        applyAuthorityReferenced(state, event);
        break;
      case 'AgentAuthorityReferenceRemoved':
        applyAuthorityReferenceRemoved(state, event);
        break;
      case 'AgentDelegationReferenced':
        applyDelegationReferenced(state, event);
        break;
      case 'AgentDelegationReferenceRemoved':
        applyDelegationReferenceRemoved(state, event);
        break;
      case 'GovernanceRecordLinked':
        applyGovernanceRecordLinked(state, event);
        break;
      case 'EvidenceBundleLinked':
        applyEvidenceBundleLinked(state, event);
        break;
      case 'PassportDisclosureViewGenerated':
      case 'PassportVerificationCompleted':
        // Observability-only events; they do not change reconstructed state.
        break;
    }

    lastEvent = event;
  }

  if (state.subject === undefined || state.organization === undefined || state.status === undefined || state.lifecycle === undefined || lastEvent === undefined) {
    throw new AgentPassportError('PASSPORT_INTEGRITY_FAILED', `Passport '${passportId}' event history never applied an 'AgentPassportCreated' event.`);
  }

  return {
    passportId,
    passportVersion: state.passportVersion,
    subject: state.subject,
    organization: state.organization,
    status: state.status,
    lifecycle: state.lifecycle,
    identity: {
      agentId: state.subject.agentId,
      agentType: state.subject.agentType,
      ...(state.subject.displayName !== undefined ? { displayName: state.subject.displayName } : {}),
    },
    capabilities: Array.from(state.capabilities.values()),
    authorities: Array.from(state.authorities.values()),
    delegations: Array.from(state.delegations.values()),
    governanceReferences: state.governanceReferences,
    evidenceReferences: state.evidenceReferences,
    provenance: {
      createdBy: state.createdBy ?? '',
      issuerOrganizationId: state.issuerOrganizationId ?? '',
      createdAt: state.createdAt ?? lastEvent.occurredAt,
      ...(state.activatedEventId !== undefined ? { activatedEventId: state.activatedEventId } : {}),
      enterpriseVersion: lastEvent.enterpriseVersion,
      passportRuntimeVersion: lastEvent.passportRuntimeVersion,
      ...(state.sourceIdentityRecord !== undefined ? { sourceIdentityRecord: state.sourceIdentityRecord } : {}),
      reconstructedThroughEventId: lastEvent.eventId,
      reconstructedThroughSequence: lastEvent.sequence,
    },
    integrity: {
      algorithm: 'sha256',
      canonicalizationVersion: AOC_CANONICALIZATION_VERSION,
      latestEventDigest: lastEvent.eventDigest,
      chainPosition: lastEvent.sequence,
    },
    createdAt: state.createdAt ?? lastEvent.occurredAt,
    updatedThroughEventId: lastEvent.eventId,
  };
}

/**
 * Derives bounded, reference-only summary metrics (mission section 50).
 * Never collapsed into a single trust score -- see "No Arbitrary Trust
 * Score" in `docs/enterprise/AOC_AGENT_PASSPORT_MODEL.md`.
 */
export function computePassportHistorySummary(passport: AgentPassport, events: readonly AgentPassportEvent[]): AgentPassportHistorySummary {
  const suspensions = events.filter((event) => event.eventType === 'AgentPassportSuspended').length;
  const revocations = events.filter((event) => event.eventType === 'AgentPassportRevoked').length;

  const allowed = passport.governanceReferences.filter((reference) => reference.status === 'allowed').length;
  const denied = passport.governanceReferences.filter((reference) => reference.status === 'denied').length;
  const approvalRequired = passport.governanceReferences.filter((reference) => reference.status === 'approval_required').length;

  const lastGovernedActivityAt = passport.governanceReferences.reduce<string | undefined>((latest, reference) => {
    if (latest === undefined || reference.occurredAt > latest) return reference.occurredAt;
    return latest;
  }, undefined);

  return {
    governanceEvaluationsReferenced: passport.governanceReferences.length,
    evidenceBundlesReferenced: passport.evidenceReferences.length,
    allowedDecisionsReferenced: allowed,
    deniedDecisionsReferenced: denied,
    approvalRequiredReferenced: approvalRequired,
    suspensions,
    revocations,
    ...(lastGovernedActivityAt !== undefined ? { lastGovernedActivityAt } : {}),
  };
}

export { AGENT_PASSPORT_SCHEMA_VERSION };
