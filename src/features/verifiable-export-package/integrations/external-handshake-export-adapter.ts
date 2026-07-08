import type { AgentVisa } from '../../external-agent-handshake/domain/agent-visa.js';
import type { HandshakeProof } from '../../external-agent-handshake/domain/handshake-proof.js';
import type { ExternalAgentStanding } from '../../external-agent-handshake/domain/external-agent-standing.js';
import { createDigest } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';

function buildItem(ctx: ExportRuntimeContext, type: ExportPackageItem['type'], sourceId: string, title: string, summary: string, payload: Record<string, unknown>): ExportPackageItem {
  return {
    id: ctx.ids.nextId('export-item'),
    type,
    sourceModule: 'external_agent_handshake',
    sourceId,
    title,
    summary,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

/** Maps a real ExternalAgentStanding into an ExportPackageItem. Never infers standing the runtime did not itself evaluate. */
export function mapExternalAgentStandingToItem(ctx: ExportRuntimeContext, standing: ExternalAgentStanding): ExportPackageItem {
  const payload = { ...standing } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'external_handshake', standing.id, `External standing ${standing.id}`, `${standing.externalAgentId}: ${standing.type} (${standing.reason}).`, payload);
}

/** Maps a real AgentVisa into an ExportPackageItem, preserving trust boundary, scope, and expiration metadata. */
export function mapAgentVisaToItem(ctx: ExportRuntimeContext, visa: AgentVisa): ExportPackageItem {
  const payload = { ...visa } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'external_agent_visa', visa.id, `Agent visa ${visa.id}`, `Visa for ${visa.externalAgentId} into ${visa.localTrustDomainId} (${visa.status}).`, payload);
}

/** Maps a real HandshakeProof into an ExportPackageItem, preserving evidenceHashes and the chained proofHash. */
export function mapHandshakeProofToItem(ctx: ExportRuntimeContext, proof: HandshakeProof): ExportPackageItem {
  const payload = { ...proof } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'external_standing_proof', proof.id, `Handshake proof ${proof.id}`, `Handshake for ${proof.externalAgentId} was ${proof.accepted ? 'accepted' : 'not accepted'}.`, payload);
}
