import type { AocControlPlaneReadModel } from '../../aoc-control-plane/domain/control-plane-view-model.js';
import type { DemoControlPlaneSnapshot } from '../../aoc-enterprise-demo/domain/demo-control-plane-snapshot.js';
import { createDigest } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';

function buildItem(ctx: ExportRuntimeContext, sourceId: string, title: string, summary: string, payload: Record<string, unknown>): ExportPackageItem {
  return {
    id: ctx.ids.nextId('export-item'),
    type: 'control_plane_snapshot',
    sourceModule: 'aoc_control_plane',
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
 * Maps a real DemoControlPlaneSnapshot (produced by a scenario run) into an
 * ExportPackageItem. This is a read-model-only projection: the snapshot's
 * own highlighted rows and generatedAt timestamp are copied verbatim, and
 * nothing here mutates the Control Plane read model.
 */
export function mapDemoControlPlaneSnapshotToItem(ctx: ExportRuntimeContext, snapshot: DemoControlPlaneSnapshot): ExportPackageItem {
  const payload = { ...snapshot } as unknown as Record<string, unknown>;
  return buildItem(ctx, snapshot.id, `Control Plane snapshot ${snapshot.id}`, `Snapshot for scenario ${snapshot.scenarioId}, generated at ${snapshot.generatedAt}.`, payload);
}

/**
 * Maps a live AocControlPlaneReadModel into an ExportPackageItem. Because
 * the read model itself has no durable id (it is regenerated on demand),
 * this adapter derives a deterministic `sourceId` from the trust domain and
 * the read model's own `generatedAt` timestamp -- it never invents a
 * timestamp or a panel the read model did not already contain.
 */
export function mapControlPlaneReadModelToItem(ctx: ExportRuntimeContext, readModel: AocControlPlaneReadModel): ExportPackageItem {
  const sourceId = `control-plane-snapshot-${readModel.trustDomainId}-${readModel.generatedAt}`;
  const payload = { ...readModel } as unknown as Record<string, unknown>;
  return buildItem(ctx, sourceId, `Control Plane read model for ${readModel.trustDomainId}`, `Generated at ${readModel.generatedAt}.`, payload);
}
