import type { ApprovalRequest } from '../../approval-runtime/domain/approval-request.js';
import type { ApprovalDecision } from '../../approval-runtime/domain/approval-decision.js';
import type { ApprovalProof } from '../../approval-runtime/domain/approval-proof.js';
import { createDigest } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';

function buildItem(ctx: ExportRuntimeContext, type: ExportPackageItem['type'], sourceId: string, title: string, summary: string, payload: Record<string, unknown>): ExportPackageItem {
  return {
    id: ctx.ids.nextId('export-item'),
    type,
    sourceModule: 'approval_runtime',
    sourceId,
    title,
    summary,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

/** Maps a real ApprovalRequest into an ExportPackageItem. Never infers a request that was not actually raised. */
export function mapApprovalRequestToItem(ctx: ExportRuntimeContext, request: ApprovalRequest): ExportPackageItem {
  const payload = { ...request } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'approval_request', request.id, `Approval request ${request.id}`, `${request.action} requested by ${request.requestedByActorId}.`, payload);
}

/** Maps a real ApprovalDecision into an ExportPackageItem. Never fakes a human review that did not occur -- the decision's own approverActorId/reason are copied verbatim. */
export function mapApprovalDecisionToItem(ctx: ExportRuntimeContext, decision: ApprovalDecision): ExportPackageItem {
  const payload = { ...decision } as unknown as Record<string, unknown>;
  return buildItem(
    ctx,
    'approval_decision',
    decision.id,
    `Approval decision ${decision.id}`,
    `${decision.type} by ${decision.approverActorId}${decision.reason !== undefined ? `: ${decision.reason}` : '.'}`,
    payload,
  );
}

/** Maps a real ApprovalProof into an ExportPackageItem, preserving evidenceHashes and the chained proofHash. */
export function mapApprovalProofToItem(ctx: ExportRuntimeContext, proof: ApprovalProof): ExportPackageItem {
  const payload = { ...proof } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'approval_proof', proof.id, `Approval proof ${proof.id}`, `Approval ${proof.approved ? 'granted' : 'not granted'} for ${proof.action}.`, payload);
}
