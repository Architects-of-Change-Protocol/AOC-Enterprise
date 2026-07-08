import type { AuthorityGrant } from '../../authority-graph/domain/authority-grant.js';
import type { DelegationGrant } from '../../authority-graph/domain/delegation-grant.js';
import type { AuthorityProof } from '../../authority-graph/domain/authority-proof.js';
import { createDigest } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';

function buildItem(ctx: ExportRuntimeContext, type: ExportPackageItem['type'], sourceId: string, title: string, summary: string, payload: Record<string, unknown>): ExportPackageItem {
  return {
    id: ctx.ids.nextId('export-item'),
    type,
    sourceModule: 'authority_graph',
    sourceId,
    title,
    summary,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

/** Maps a real AuthorityGrant into an ExportPackageItem. Never recomputes the grant -- only hashes its exported payload. */
export function mapAuthorityGrantToItem(ctx: ExportRuntimeContext, grant: AuthorityGrant): ExportPackageItem {
  const payload = { ...grant } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'authority_grant', grant.id, `Authority grant ${grant.id}`, `${grant.capability} granted by ${grant.issuerActorId} to ${grant.subjectActorId}.`, payload);
}

/** Maps a real DelegationGrant into an ExportPackageItem, preserving the delegation lineage (sourceAuthorityGrantId). */
export function mapDelegationGrantToItem(ctx: ExportRuntimeContext, delegation: DelegationGrant): ExportPackageItem {
  const payload = { ...delegation } as unknown as Record<string, unknown>;
  return buildItem(
    ctx,
    'authority_delegation',
    delegation.id,
    `Delegation ${delegation.id}`,
    `${delegation.capability} delegated by ${delegation.delegatorActorId} to ${delegation.delegateActorId}.`,
    payload,
  );
}

/** Maps a real AuthorityProof into an ExportPackageItem, preserving evaluatedGrantIds/evaluatedDelegationIds and the chained proofHash. */
export function mapAuthorityProofToItem(ctx: ExportRuntimeContext, proof: AuthorityProof): ExportPackageItem {
  const payload = { ...proof } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'authority_proof', proof.id, `Authority proof ${proof.id}`, `Authority decision "${proof.decisionType}" is ${proof.valid ? 'valid' : 'invalid'}.`, payload);
}
