import {
  GOVERNED_CONSTRAINT_POLICY_METADATA_KEY,
  type GovernedConstraintPolicyContext,
} from '@aoc-enterprise/governed-authority';

import type { GuardActionRequestInput } from '../../features/action-enforcement/sdk/aoc-guard.js';
import type { EnforcementPolicyEvaluationInput } from '../../features/action-enforcement/domain/enforcement-request.js';
import type { EnforcementTargetType } from '../../features/action-enforcement/domain/enforcement-target.js';
import type { KernelEvaluationOptions } from '../contracts/kernel-options.js';
import type { KernelEvaluationRequest } from '../contracts/kernel-request.js';
import { KernelValidationError } from '../errors/kernel-errors.js';

const ENFORCEMENT_TARGET_TYPES: ReadonlySet<string> = new Set<EnforcementTargetType>([
  'tool_call',
  'api_handler',
  'workflow_step',
  'webhook',
  'scheduled_job',
  'manual_operation',
  'generic',
]);

function toEnforcementTargetType(type: string | undefined): EnforcementTargetType | undefined {
  return type !== undefined && ENFORCEMENT_TARGET_TYPES.has(type) ? (type as EnforcementTargetType) : undefined;
}

/** Structural validation only -- checks required-field shape, not governance content. A request that fails these checks never reaches the wrapped engine at all. */
export function validateKernelEvaluationRequest(request: KernelEvaluationRequest): void {
  if (!request.requestId || request.requestId.trim().length === 0) {
    throw new KernelValidationError('KernelEvaluationRequest.requestId is required and must be non-empty.');
  }
  if (!request.actor || !request.actor.id || request.actor.id.trim().length === 0) {
    throw new KernelValidationError('KernelEvaluationRequest.actor.id is required and must be non-empty.');
  }
  if (!request.actor.trustDomainId || request.actor.trustDomainId.trim().length === 0) {
    throw new KernelValidationError('KernelEvaluationRequest.actor.trustDomainId is required and must be non-empty.');
  }
  if (!request.action || !request.action.type || request.action.type.trim().length === 0) {
    throw new KernelValidationError('KernelEvaluationRequest.action.type is required and must be non-empty.');
  }
  if (!request.action.resourceScope || request.action.resourceScope.trim().length === 0) {
    throw new KernelValidationError('KernelEvaluationRequest.action.resourceScope is required and must be non-empty.');
  }
  if (!request.requestedAt || Number.isNaN(Date.parse(request.requestedAt))) {
    throw new KernelValidationError('KernelEvaluationRequest.requestedAt must be a valid ISO-8601 timestamp.');
  }
}

/**
 * Assembles the optional Domain Policy Pack preflight input.
 *
 * The governed constraint context, when one was resolved, travels in the
 * deployment metadata bag under a namespaced key rather than as a new top-level
 * field. Two reasons, both deliberate: the bag is already the documented place
 * for facts a deployment's own rules turn on, and keeping it out of the typed
 * policy-input surface means a deployment that has never heard of persistent
 * constraints compiles, runs and decides exactly as it did before.
 *
 * A resolved context is enough on its own to build an input. A request that
 * engages governed rights but sets none of the policy-pack fields still needs
 * its constraint facts to reach a policy that asked for them, and returning
 * `undefined` because no *other* field was set would drop them silently.
 */
function buildPolicyEvaluationInput(
  request: KernelEvaluationRequest,
  constraintContext: GovernedConstraintPolicyContext | undefined,
): EnforcementPolicyEvaluationInput | undefined {
  const { action } = request;
  const hasPolicyPackFields =
    constraintContext !== undefined ||
    action.domain !== undefined ||
    action.jurisdiction !== undefined ||
    action.country !== undefined ||
    action.industry !== undefined ||
    action.customerId !== undefined ||
    action.amount !== undefined ||
    action.currency !== undefined ||
    action.counterpartyId !== undefined ||
    action.dataDomains !== undefined ||
    action.evidenceIds !== undefined;

  if (!hasPolicyPackFields) {
    return undefined;
  }

  return {
    ...(action.domain !== undefined ? { domain: action.domain } : {}),
    ...(action.jurisdiction !== undefined ? { jurisdiction: action.jurisdiction } : {}),
    ...(action.country !== undefined ? { country: action.country } : {}),
    ...(action.industry !== undefined ? { industry: action.industry } : {}),
    ...(action.customerId !== undefined ? { customerId: action.customerId } : {}),
    ...(action.amount !== undefined ? { amount: action.amount } : {}),
    ...(action.currency !== undefined ? { currency: action.currency } : {}),
    ...(action.counterpartyId !== undefined ? { counterpartyId: action.counterpartyId } : {}),
    ...(action.dataDomains !== undefined ? { dataDomains: action.dataDomains } : {}),
    ...(action.evidenceIds !== undefined ? { evidenceIds: action.evidenceIds } : {}),
    ...(constraintContext !== undefined ? { metadata: { [GOVERNED_CONSTRAINT_POLICY_METADATA_KEY]: constraintContext } } : {}),
  };
}

/**
 * Maps a `KernelEvaluationRequest` onto the wrapped engine's own
 * `GuardActionRequestInput`. Never mutates the input request. `mode` is
 * `'dry_run'` when `options.dryRun` is set, otherwise left to the caller
 * (`preflight` for `evaluate()`, `execute` for `enforce()` -- set by the
 * caller of this function, not here).
 */
export function toGuardActionRequestInput(
  request: KernelEvaluationRequest,
  options: KernelEvaluationOptions | undefined,
  constraintContext?: GovernedConstraintPolicyContext,
): GuardActionRequestInput {
  const { actor, action, target } = request;
  const policyEvaluationInput = buildPolicyEvaluationInput(request, constraintContext);
  const targetType = toEnforcementTargetType(target?.type);
  const context: Record<string, unknown> = { ...(request.context ?? {}) };
  if (request.organization !== undefined) {
    context.organizationId = request.organization.id;
    if (request.organization.name !== undefined) {
      context.organizationName = request.organization.name;
    }
  }
  if (request.correlationId !== undefined) {
    context.correlationId = request.correlationId;
  }
  if (action.parameters !== undefined) {
    context.parameters = action.parameters;
  }

  return {
    actorId: actor.id,
    trustDomainId: actor.trustDomainId,
    action: action.type,
    resourceScope: action.resourceScope,
    actionRequestId: request.requestId,
    metadata: context,
    ...(actor.principalId !== undefined ? { principalActorId: actor.principalId } : {}),
    ...(action.capability !== undefined ? { capability: action.capability } : {}),
    ...(action.riskLevel !== undefined ? { riskLevel: action.riskLevel } : {}),
    ...(action.sideEffectType !== undefined ? { sideEffectType: action.sideEffectType } : {}),
    ...(target?.id !== undefined ? { targetId: target.id } : {}),
    ...(targetType !== undefined ? { targetType } : {}),
    ...(target?.name !== undefined ? { targetName: target.name } : {}),
    ...(target?.adapterId !== undefined ? { adapterId: target.adapterId } : {}),
    ...(request.idempotencyKey !== undefined ? { idempotencyKey: request.idempotencyKey } : {}),
    ...(request.expiresAt !== undefined ? { expiresAt: request.expiresAt } : {}),
    ...(request.approvalProofId !== undefined ? { approvalProofId: request.approvalProofId } : {}),
    ...(request.approvalRequestId !== undefined ? { approvalRequestId: request.approvalRequestId } : {}),
    ...(request.approvalDecisionId !== undefined ? { approvalDecisionId: request.approvalDecisionId } : {}),
    ...(request.visaId !== undefined ? { visaId: request.visaId } : {}),
    ...(request.ingressGrantId !== undefined ? { ingressGrantId: request.ingressGrantId } : {}),
    ...(request.handshakeProofId !== undefined ? { handshakeProofId: request.handshakeProofId } : {}),
    ...(policyEvaluationInput !== undefined ? { policyEvaluationInput } : {}),
    ...(options?.dryRun === true ? { mode: 'dry_run' as const } : {}),
  };
}
