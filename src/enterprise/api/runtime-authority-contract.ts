import { EnterpriseHttpErrors } from './enterprise-http-errors.js';
import type {
  CreateGovernedRuntimeInput,
  GrantCapabilityInput,
  IssueLeaseInput,
  ProtectedActionRequest,
  RegisterGovernedAgentInput,
} from '../runtime-authority/index.js';
import type { GatewayDecision, RuntimeControlRequest, RuntimeControlSeverity, SignedAuthorityLease } from '../runtime-authority/contracts.js';

/**
 * Maps a `GatewayDecision` onto an HTTP status (mission section 8: "The
 * enforcement gateway returns 403 AUTHORITY_REVOKED"). A denial is a
 * *successful* enforcement decision, never an `EnterpriseHttpError` -- the
 * body always carries the full `GatewayDecision`, including its
 * machine-readable `code` and the `evidenceEventId` that recorded it.
 */
export function mapGatewayDecisionToHttpStatus(decision: GatewayDecision): number {
  if (decision.decision === 'ALLOW') return 200;
  switch (decision.code) {
    case 'RUNTIME_NOT_FOUND':
    case 'AGENT_NOT_FOUND':
      return 404;
    case 'AUTHORITY_SERVICE_UNAVAILABLE':
      return 503;
    default:
      return 403;
  }
}

/** HTTP/JSON shape validation only (mirrors `passport-contract.ts`) -- `RuntimeAuthorityService`/the Gateway still validate the resolved input itself. */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

const SEVERITIES: readonly RuntimeControlSeverity[] = ['low', 'medium', 'high', 'critical'];

export function validateRegisterAgentRequestBody(body: unknown): RegisterGovernedAgentInput & { readonly actorId: string } {
  if (!isPlainObject(body)) throw EnterpriseHttpErrors.invalidRequest('Request body must be a JSON object.');
  const violations: string[] = [];
  if (!isNonEmptyString(body.agentId)) violations.push('agentId is a required non-empty string.');
  if (!isNonEmptyString(body.tenantId)) violations.push('tenantId is a required non-empty string.');
  if (!isNonEmptyString(body.displayName)) violations.push('displayName is a required non-empty string.');
  if (!isNonEmptyString(body.agentType)) violations.push('agentType is a required non-empty string.');
  if (!isNonEmptyString(body.ownerAuthorityId)) violations.push('ownerAuthorityId is a required non-empty string.');
  if (!isNonEmptyString(body.actorId)) violations.push('actorId is a required non-empty string.');
  if (violations.length > 0) throw EnterpriseHttpErrors.invalidRequest('The agent registration request failed validation.', violations);
  return {
    agentId: body.agentId as string,
    tenantId: body.tenantId as string,
    displayName: body.displayName as string,
    agentType: body.agentType as string,
    ownerAuthorityId: body.ownerAuthorityId as string,
    actorId: body.actorId as string,
    ...(typeof body.publicKey === 'string' ? { publicKey: body.publicKey } : {}),
    ...(typeof body.passportId === 'string' ? { passportId: body.passportId } : {}),
  };
}

export function validateControlRequestBody(body: unknown): RuntimeControlRequest {
  if (!isPlainObject(body)) throw EnterpriseHttpErrors.invalidRequest('Request body must be a JSON object.');
  const violations: string[] = [];
  if (!isNonEmptyString(body.reason)) violations.push('reason is a required non-empty string.');
  if (!isNonEmptyString(body.requestedBy)) violations.push('requestedBy is a required non-empty string.');
  if (!(SEVERITIES as readonly string[]).includes(body.severity as string)) violations.push(`severity is required and must be one of: ${SEVERITIES.join(', ')}.`);
  if (violations.length > 0) throw EnterpriseHttpErrors.invalidRequest('The control request failed validation.', violations);
  return {
    reason: body.reason as string,
    requestedBy: body.requestedBy as string,
    severity: body.severity as RuntimeControlSeverity,
    ...(typeof body.correlationId === 'string' ? { correlationId: body.correlationId } : {}),
  };
}

export interface ResumeRequestBody {
  readonly control: RuntimeControlRequest;
  readonly capabilities?: readonly string[];
}

export function validateResumeRequestBody(body: unknown): ResumeRequestBody {
  const control = validateControlRequestBody(body);
  const capabilities = isPlainObject(body) && Array.isArray(body.capabilities) ? (body.capabilities.filter((c): c is string => typeof c === 'string')) : undefined;
  return capabilities !== undefined ? { control, capabilities } : { control };
}

export function validateCreateRuntimeRequestBody(body: unknown): CreateGovernedRuntimeInput & { readonly actorId: string } {
  if (!isPlainObject(body)) throw EnterpriseHttpErrors.invalidRequest('Request body must be a JSON object.');
  const violations: string[] = [];
  if (!isNonEmptyString(body.tenantId)) violations.push('tenantId is a required non-empty string.');
  if (!isNonEmptyString(body.agentId)) violations.push('agentId is a required non-empty string.');
  if (!isNonEmptyString(body.environmentId)) violations.push('environmentId is a required non-empty string.');
  if (!isNonEmptyString(body.policyVersion)) violations.push('policyVersion is a required non-empty string.');
  if (!isNonEmptyString(body.actorId)) violations.push('actorId is a required non-empty string.');
  if (violations.length > 0) throw EnterpriseHttpErrors.invalidRequest('The runtime creation request failed validation.', violations);
  return {
    tenantId: body.tenantId as string,
    agentId: body.agentId as string,
    environmentId: body.environmentId as string,
    policyVersion: body.policyVersion as string,
    actorId: body.actorId as string,
    ...(typeof body.riskScore === 'number' ? { riskScore: body.riskScore } : {}),
  };
}

export function validateActorIdRequestBody(body: unknown): { readonly actorId: string } {
  if (!isPlainObject(body) || !isNonEmptyString(body.actorId)) {
    throw EnterpriseHttpErrors.invalidRequest("The request body must include a non-empty 'actorId'.", ['actorId is a required non-empty string.']);
  }
  return { actorId: body.actorId };
}

export function validateGrantCapabilityRequestBody(body: unknown, tenantId: string, runtimeId: string): GrantCapabilityInput {
  if (!isPlainObject(body)) throw EnterpriseHttpErrors.invalidRequest('Request body must be a JSON object.');
  const violations: string[] = [];
  if (!isNonEmptyString(body.agentId)) violations.push('agentId is a required non-empty string.');
  if (!isNonEmptyString(body.capability)) violations.push('capability is a required non-empty string.');
  if (!isNonEmptyString(body.issuedBy)) violations.push('issuedBy is a required non-empty string.');
  if (violations.length > 0) throw EnterpriseHttpErrors.invalidRequest('The capability grant request failed validation.', violations);
  return {
    tenantId,
    runtimeId,
    agentId: body.agentId as string,
    capability: body.capability as string,
    issuedBy: body.issuedBy as string,
    resourceScope: isPlainObject(body.resourceScope) ? body.resourceScope : {},
    constraints: isPlainObject(body.constraints) ? body.constraints : {},
    ...(typeof body.expiresAt === 'string' ? { expiresAt: body.expiresAt } : {}),
  };
}

export function validateIssueLeaseRequestBody(body: unknown, tenantId: string, runtimeId: string): IssueLeaseInput {
  if (!isPlainObject(body)) throw EnterpriseHttpErrors.invalidRequest('Request body must be a JSON object.');
  const violations: string[] = [];
  if (!isNonEmptyString(body.agentId)) violations.push('agentId is a required non-empty string.');
  if (!isNonEmptyString(body.issuedBy)) violations.push('issuedBy is a required non-empty string.');
  if (!Array.isArray(body.capabilities) || body.capabilities.length === 0 || !body.capabilities.every((c) => typeof c === 'string')) {
    violations.push('capabilities is a required non-empty array of strings.');
  }
  if (violations.length > 0) throw EnterpriseHttpErrors.invalidRequest('The lease issuance request failed validation.', violations);
  return {
    tenantId,
    runtimeId,
    agentId: body.agentId as string,
    issuedBy: body.issuedBy as string,
    capabilities: body.capabilities as readonly string[],
    ...(typeof body.ttlSeconds === 'number' ? { ttlSeconds: body.ttlSeconds } : {}),
  };
}

function isSignedLease(value: unknown): value is SignedAuthorityLease {
  if (!isPlainObject(value) || !isPlainObject(value.payload) || !isNonEmptyString(value.signature)) return false;
  const p = value.payload;
  return (
    isNonEmptyString(p.leaseId) &&
    isNonEmptyString(p.tenantId) &&
    isNonEmptyString(p.runtimeId) &&
    isNonEmptyString(p.agentId) &&
    Array.isArray(p.capabilities) &&
    isNonEmptyString(p.policyVersion) &&
    isNonEmptyString(p.issuedAt) &&
    isNonEmptyString(p.expiresAt) &&
    isNonEmptyString(p.nonce) &&
    isNonEmptyString(p.keyId)
  );
}

export function validateProtectedActionRequestBody(body: unknown, tenantId: string, runtimeId: string): ProtectedActionRequest {
  if (!isPlainObject(body)) throw EnterpriseHttpErrors.invalidRequest('Request body must be a JSON object.');
  const violations: string[] = [];
  if (!isNonEmptyString(body.agentId)) violations.push('agentId is a required non-empty string.');
  if (!isNonEmptyString(body.capability)) violations.push('capability is a required non-empty string.');
  if (!isNonEmptyString(body.requestNonce)) violations.push('requestNonce is a required non-empty string.');
  if (!isNonEmptyString(body.correlationId)) violations.push('correlationId is a required non-empty string.');
  if (!isSignedLease(body.lease)) violations.push('lease is a required SignedAuthorityLease ({ payload, signature }).');
  if (violations.length > 0) throw EnterpriseHttpErrors.invalidRequest('The protected action request failed validation.', violations);
  return {
    tenantId,
    runtimeId,
    agentId: body.agentId as string,
    capability: body.capability as string,
    resource: isPlainObject(body.resource) ? body.resource : {},
    lease: body.lease as SignedAuthorityLease,
    requestNonce: body.requestNonce as string,
    correlationId: body.correlationId as string,
  };
}
