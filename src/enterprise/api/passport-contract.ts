import { EnterpriseHttpErrors } from './enterprise-http-errors.js';
import type {
  AgentAuthorityReference,
  AgentCapabilityReference,
  AgentDelegationReference,
  AgentPassportLoadResult,
  AgentPassportSubjectType,
  PassportEvidenceReference,
  PassportGovernanceReference,
} from '../passport/contracts.js';
import type {
  IssueAgentPassportInput,
  RetireAgentPassportInput,
  RevokeAgentPassportInput,
  SuspendAgentPassportInput,
} from '../passport/service.js';

/** HTTP/JSON shape validation only (mirrors `validateEvidenceBuildRequestBody`) -- `AgentPassportService` still validates the resolved input itself. */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

const AGENT_TYPES: readonly AgentPassportSubjectType[] = ['autonomous_agent', 'assistant_agent', 'workflow_agent', 'decision_agent', 'service_agent', 'external_agent'];

function isAgentType(value: unknown): value is AgentPassportSubjectType {
  return typeof value === 'string' && (AGENT_TYPES as readonly string[]).includes(value);
}

export function validateIssuePassportRequestBody(body: unknown): IssueAgentPassportInput {
  if (!isPlainObject(body)) throw EnterpriseHttpErrors.invalidRequest('Request body must be a JSON object.');
  const violations: string[] = [];

  const subjectRaw = body.subject;
  if (!isPlainObject(subjectRaw)) violations.push('subject is a required object.');
  const subject = isPlainObject(subjectRaw) ? subjectRaw : {};
  if (!isNonEmptyString(subject.agentId)) violations.push('subject.agentId is a required non-empty string.');
  if (!isAgentType(subject.agentType)) violations.push(`subject.agentType must be one of: ${AGENT_TYPES.join(', ')}.`);

  const organizationRaw = body.organization;
  if (!isPlainObject(organizationRaw)) violations.push('organization is a required object.');
  const organization = isPlainObject(organizationRaw) ? organizationRaw : {};
  if (!isNonEmptyString(organization.organizationId)) violations.push('organization.organizationId is a required non-empty string.');
  if (!isNonEmptyString(organization.recognizedBy)) violations.push('organization.recognizedBy is a required non-empty string.');

  if (!isNonEmptyString(body.actorId)) violations.push('actorId is a required non-empty string.');

  if (violations.length > 0) throw EnterpriseHttpErrors.invalidRequest('The Agent Passport issuance request failed validation.', violations);

  return {
    subject: subject as unknown as IssueAgentPassportInput['subject'],
    organization: organization as unknown as IssueAgentPassportInput['organization'],
    actorId: body.actorId as string,
    ...(typeof body.actorType === 'string' ? { actorType: body.actorType } : {}),
    ...(typeof body.activateImmediately === 'boolean' ? { activateImmediately: body.activateImmediately } : {}),
    ...(Array.isArray(body.capabilities) ? { capabilities: body.capabilities as readonly AgentCapabilityReference[] } : {}),
    ...(Array.isArray(body.authorities) ? { authorities: body.authorities as readonly AgentAuthorityReference[] } : {}),
    ...(Array.isArray(body.delegations) ? { delegations: body.delegations as readonly AgentDelegationReference[] } : {}),
    ...(typeof body.sourceIdentityRecord === 'string' ? { sourceIdentityRecord: body.sourceIdentityRecord } : {}),
    ...(typeof body.idempotencyKey === 'string' && body.idempotencyKey.length > 0 ? { idempotencyKey: body.idempotencyKey } : {}),
  };
}

export function validateActorRequestBody(body: unknown, field = 'actorId'): { readonly actorId: string } {
  if (!isPlainObject(body) || !isNonEmptyString(body[field])) {
    throw EnterpriseHttpErrors.invalidRequest(`The request body must include a non-empty '${field}'.`, [`${field} is a required non-empty string.`]);
  }
  return { actorId: body[field] };
}

export function validateSuspendRequestBody(body: unknown): SuspendAgentPassportInput {
  if (!isPlainObject(body) || !isNonEmptyString(body.suspendedBy)) {
    throw EnterpriseHttpErrors.invalidRequest('The suspend request failed validation.', ['suspendedBy is a required non-empty string.']);
  }
  return {
    suspendedBy: body.suspendedBy,
    ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
    ...(typeof body.expectedReviewAt === 'string' ? { expectedReviewAt: body.expectedReviewAt } : {}),
    ...(typeof body.evidenceBundleId === 'string' ? { evidenceBundleId: body.evidenceBundleId } : {}),
  };
}

export function validateRevokeRequestBody(body: unknown): RevokeAgentPassportInput {
  if (!isPlainObject(body)) throw EnterpriseHttpErrors.invalidRequest('Request body must be a JSON object.');
  const violations: string[] = [];
  if (!isNonEmptyString(body.reasonCode)) violations.push('reasonCode is a required non-empty string.');
  if (!isNonEmptyString(body.reason)) violations.push('reason is a required non-empty string.');
  if (!isNonEmptyString(body.revokedBy)) violations.push('revokedBy is a required non-empty string.');
  if (violations.length > 0) throw EnterpriseHttpErrors.invalidRequest('The revoke request failed validation.', violations);
  return {
    reasonCode: body.reasonCode as string,
    reason: body.reason as string,
    revokedBy: body.revokedBy as string,
    ...(typeof body.evidenceBundleId === 'string' ? { evidenceBundleId: body.evidenceBundleId } : {}),
  };
}

export function validateRetireRequestBody(body: unknown): RetireAgentPassportInput {
  if (!isPlainObject(body) || !isNonEmptyString(body.retiredBy)) {
    throw EnterpriseHttpErrors.invalidRequest('The retire request failed validation.', ['retiredBy is a required non-empty string.']);
  }
  return {
    retiredBy: body.retiredBy,
    ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
  };
}

export interface LinkGovernanceRecordRequestBody {
  readonly reference: PassportGovernanceReference;
  readonly actorId: string;
}

export function validateLinkGovernanceRequestBody(body: unknown): LinkGovernanceRecordRequestBody {
  if (!isPlainObject(body) || !isPlainObject(body.reference) || !isNonEmptyString(body.actorId)) {
    throw EnterpriseHttpErrors.invalidRequest('The governance-link request failed validation.', ['reference is a required object.', 'actorId is a required non-empty string.']);
  }
  return { reference: body.reference as unknown as PassportGovernanceReference, actorId: body.actorId };
}

export interface LinkEvidenceBundleRequestBody {
  readonly reference: PassportEvidenceReference;
  readonly actorId: string;
}

export function validateLinkEvidenceRequestBody(body: unknown): LinkEvidenceBundleRequestBody {
  if (!isPlainObject(body) || !isPlainObject(body.reference) || !isNonEmptyString(body.actorId)) {
    throw EnterpriseHttpErrors.invalidRequest('The evidence-link request failed validation.', ['reference is a required object.', 'actorId is a required non-empty string.']);
  }
  return { reference: body.reference as unknown as PassportEvidenceReference, actorId: body.actorId };
}

export interface BuildViewRequestBody {
  readonly viewType: string;
  readonly generatedBy: string;
}

export function validateBuildViewRequestBody(body: unknown): BuildViewRequestBody {
  if (!isPlainObject(body) || !isNonEmptyString(body.viewType) || !isNonEmptyString(body.generatedBy)) {
    throw EnterpriseHttpErrors.invalidRequest('The view-build request failed validation.', ['viewType is a required non-empty string.', 'generatedBy is a required non-empty string.']);
  }
  return { viewType: body.viewType, generatedBy: body.generatedBy };
}

export interface VerifyPassportRequestBody {
  readonly mode?: 'STRUCTURAL' | 'REFERENTIAL' | 'FULL_INTERNAL';
}

export function validateVerifyRequestBody(body: unknown): VerifyPassportRequestBody {
  if (body === undefined || body === null) return {};
  if (!isPlainObject(body)) throw EnterpriseHttpErrors.invalidRequest('Request body, when present, must be a JSON object.');
  if (body.mode === undefined) return {};
  if (body.mode !== 'STRUCTURAL' && body.mode !== 'REFERENTIAL' && body.mode !== 'FULL_INTERNAL') {
    throw EnterpriseHttpErrors.invalidRequest("mode, when present, must be one of 'STRUCTURAL', 'REFERENTIAL', 'FULL_INTERNAL'.");
  }
  return { mode: body.mode };
}

/** Maps `AgentPassportLoadResult` onto the wire: 200 with the reconstructed Passport when complete, 404-shaped when the caller asked for a Passport that was never found (handled by the caller catching `PASSPORT_NOT_FOUND`), 500-shaped body when `incomplete`/`corrupted`. */
export function toPassportLoadResponseBody(load: AgentPassportLoadResult): AgentPassportLoadResult {
  return load;
}
