import type { KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
import type { GovernanceEvaluationRecord, GovernanceRequestRecord, GovernanceTraceRecord } from './governance-store.js';

export function toGovernanceRequestRecord(request: KernelEvaluationRequest, receivedAt: string): GovernanceRequestRecord {
  return {
    requestId: request.requestId,
    ...(request.correlationId !== undefined ? { correlationId: request.correlationId } : {}),
    actorId: request.actor.id,
    actionType: request.action.type,
    resourceScope: request.action.resourceScope,
    ...(request.organization?.id !== undefined ? { organizationId: request.organization.id } : {}),
    requestedAt: request.requestedAt,
    receivedAt,
    requestPayload: request,
  };
}

export function toGovernanceEvaluationRecord(result: KernelEvaluationResult): GovernanceEvaluationRecord {
  return {
    decisionId: result.decisionId,
    requestId: result.requestId,
    status: result.status,
    reasonCodes: result.reasonCodes,
    summary: result.summary,
    kernelVersion: result.kernelVersion,
    evaluatedAt: result.evaluatedAt,
    ...(result.correlationId !== undefined ? { correlationId: result.correlationId } : {}),
  };
}

export function toGovernanceTraceRecord(result: KernelEvaluationResult): GovernanceTraceRecord {
  return {
    decisionId: result.decisionId,
    trace: result.trace,
  };
}

/** Structural equality over the fields that define "the same request," used to distinguish an idempotent replay from a genuine conflict. */
export function isSameRequestPayload(a: KernelEvaluationRequest, b: KernelEvaluationRequest): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
