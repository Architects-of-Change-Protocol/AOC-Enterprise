import type { RecognitionDecision } from '../../recognition-runtime/domain/recognition-decision.js';
import type { RecognitionProof } from '../../recognition-runtime/domain/proof.js';
import { createDigest } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';

function buildItem(ctx: ExportRuntimeContext, type: ExportPackageItem['type'], sourceId: string, title: string, summary: string, payload: Record<string, unknown>): ExportPackageItem {
  return {
    id: ctx.ids.nextId('export-item'),
    type,
    sourceModule: 'recognition_runtime',
    sourceId,
    title,
    summary,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

/**
 * Maps a real RecognitionDecision into an ExportPackageItem. This adapter
 * never re-evaluates recognition and never overrides a denial -- it copies
 * the decision's own fields (including a `deny`/`revoked`/etc. type) as-is.
 */
export function mapRecognitionDecisionToItem(ctx: ExportRuntimeContext, decision: RecognitionDecision): ExportPackageItem {
  const payload = { ...decision } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'recognition_decision', decision.id, `Recognition decision ${decision.id}`, decision.reason, payload);
}

/**
 * Maps a real RecognitionProof into an ExportPackageItem. RecognitionProof
 * has no `id` of its own (it is a bare signature record), so this adapter
 * uses the proof's own digest as its stable `sourceId` and requires the
 * caller to supply the decision id it signs for a readable title.
 */
export function mapRecognitionProofToItem(ctx: ExportRuntimeContext, proof: RecognitionProof, recognitionDecisionId: string): ExportPackageItem {
  const payload = { ...proof, recognitionDecisionId } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'recognition_proof', proof.digest, `Recognition proof for ${recognitionDecisionId}`, `Signed by ${proof.signedBy} at ${proof.signedAt}.`, payload);
}
