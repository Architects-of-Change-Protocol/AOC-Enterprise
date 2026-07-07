import type { EnforcementRequest } from '../../action-enforcement/domain/enforcement-request.js';
import type { EnforcementDecision } from '../../action-enforcement/domain/enforcement-decision.js';
import type { EnforcementProof } from '../../action-enforcement/domain/enforcement-proof.js';
import type { ExecutionResult } from '../../action-enforcement/domain/execution-result.js';
import type { SideEffectDescriptor } from '../../action-enforcement/domain/side-effect.js';
import type { EnforcementEvent } from '../../action-enforcement/domain/enforcement-event.js';
import { createDigest } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';

function buildItem(ctx: ExportRuntimeContext, type: ExportPackageItem['type'], sourceId: string, title: string, summary: string, payload: Record<string, unknown>): ExportPackageItem {
  return {
    id: ctx.ids.nextId('export-item'),
    type,
    sourceModule: 'action_enforcement',
    sourceId,
    title,
    summary,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

/** Maps a real EnforcementRequest into an ExportPackageItem. Never re-runs preflight or fabricates a request. */
export function mapEnforcementRequestToItem(ctx: ExportRuntimeContext, request: EnforcementRequest): ExportPackageItem {
  const payload = { ...request } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'enforcement_request', request.id, `Enforcement request ${request.id}`, `${request.mode} request for ${request.action} on ${request.resourceScope}.`, payload);
}

/**
 * Maps a real EnforcementDecision into an ExportPackageItem, preserving
 * every upstream reference (recognitionDecisionId, authorityProofId,
 * approvalProofId, handshakeProofId, policyDecisionId, policyProofId) so
 * the reference resolver can link this decision to the proofs it required.
 */
export function mapEnforcementDecisionToItem(ctx: ExportRuntimeContext, decision: EnforcementDecision): ExportPackageItem {
  const payload = { ...decision } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'enforcement_decision', decision.id, `Enforcement decision ${decision.id}`, `${decision.type}: ${decision.reason}`, payload);
}

/** Maps a real EnforcementProof into an ExportPackageItem, preserving sideEffectIds and the chained proofHash. Never re-runs execution. */
export function mapEnforcementProofToItem(ctx: ExportRuntimeContext, proof: EnforcementProof): ExportPackageItem {
  const payload = { ...proof } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'enforcement_proof', proof.id, `Enforcement proof ${proof.id}`, `${proof.action} ${proof.executed ? 'executed' : 'not executed'} (allowed=${proof.allowedToExecute}).`, payload);
}

/** Maps a real ExecutionResult into an ExportPackageItem. Never changes or re-derives the execution status -- copies it verbatim. */
export function mapExecutionResultToItem(ctx: ExportRuntimeContext, result: ExecutionResult): ExportPackageItem {
  const payload = { ...result } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'execution_result', result.id, `Execution result ${result.id}`, `Status: ${result.status}.`, payload);
}

/** Maps a real SideEffectDescriptor into an ExportPackageItem. */
export function mapSideEffectToItem(ctx: ExportRuntimeContext, sideEffect: SideEffectDescriptor): ExportPackageItem {
  const payload = { ...sideEffect } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'side_effect_result', sideEffect.id, `Side effect ${sideEffect.id}`, `${sideEffect.type}: ${sideEffect.status}.`, payload);
}

/** Maps a real EnforcementEvent into an ExportPackageItem, for inclusion in the events section's event trail. */
export function mapEnforcementEventToItem(ctx: ExportRuntimeContext, event: EnforcementEvent): ExportPackageItem {
  const payload = { ...event } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'enforcement_event', event.id, `Enforcement event ${event.id}`, event.type, payload);
}
