import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import type { ExportPackageFormat, SerializedExportPackage } from '../domain/export-package-format.js';
import { createExportPackageRuntime, ExportPackageRuntime } from '../services/export-package-runtime.js';

const NOW = '2026-01-01T00:00:00.000Z';

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

function makeItem(
  ctx: ExportRuntimeContext,
  type: ExportPackageItemType,
  sourceModule: ExportPackageItemSourceModule,
  sourceId: string,
  payload: Record<string, unknown> = {},
): ExportPackageItem {
  return {
    id: ctx.ids.nextId('item'),
    type,
    sourceModule,
    sourceId,
    title: `Item for ${sourceId}`,
    summary: `Summary for ${sourceId}`,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

interface SealedAndVerifiedPackage {
  readonly ctx: ExportRuntimeContext;
  readonly runtime: ExportPackageRuntime;
  readonly packageId: string;
}

/** Builds a genuinely sealed and verified `decision_packet`, for serializer-shape and determinism tests. */
function buildSealedAndVerifiedDecisionPacket(): SealedAndVerifiedPackage {
  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);
  const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', { text: 'hello' });
  const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', { allowedToExecute: true, reasonCode: 'OK', reason: 'ok' });
  const proofItem = makeItem(ctx, 'enforcement_proof', 'action_enforcement', 'enforcement-proof-1', { enforcementDecisionId: 'enforcement-decision-1' });

  const { pkg } = runtime.createDecisionPacket({
    title: 'Serializer test decision packet',
    description: 'A clean, fully-satisfied decision packet for serializer tests.',
    trustDomainId: 'trust-domain-1',
    targetType: 'enforcement_decision',
    targetId: 'enforcement-decision-1',
    sections: [
      { type: 'summary', required: true, items: [summaryItem] },
      { type: 'enforcement', required: true, items: [decisionItem, proofItem] },
    ],
  });

  runtime.sealPackage(pkg.id);
  runtime.verifyPackage(pkg.id);
  return { ctx, runtime, packageId: pkg.id };
}

function assertSerializedShape(artifact: SerializedExportPackage, expectedFormat: ExportPackageFormat): void {
  assert.equal(typeof artifact.id, 'string');
  assert.equal(typeof artifact.packageId, 'string');
  assert.equal(artifact.format, expectedFormat);
  assert.equal(typeof artifact.title, 'string');
  assert.equal(typeof artifact.content, 'string');
  assert.equal(typeof artifact.contentHash, 'string');
  JSON.parse(artifact.content);
}

describe('ExportPackageSerializer', () => {
  it('1. serializeJsonBundle produces valid, deterministic JSON', () => {
    const { ctx, runtime, packageId } = buildSealedAndVerifiedDecisionPacket();
    const pkg = required(runtime.getPackage(packageId), 'Expected a package.');
    const manifest = required(runtime.getPackageManifest(packageId), 'Expected a manifest.');
    const verification = required(runtime.getPackageVerification(packageId), 'Expected a verification.');

    const first = runtime.serializer.serializeJsonBundle(ctx, pkg, manifest, verification);
    const second = runtime.serializer.serializeJsonBundle(ctx, pkg, manifest, verification);

    assertSerializedShape(first, 'json_bundle');
    assert.equal(first.content, second.content);
    assert.equal(first.contentHash, second.contentHash);
    assert.equal(first.contentHash, runtime.hashService.hashSerializedArtifact(first.content));

    const parsed = JSON.parse(first.content) as { readonly package: { readonly id: string } };
    assert.equal(parsed.package.id, pkg.id);
  });

  it('2. serializeManifest produces valid, deterministic JSON', () => {
    const { ctx, runtime, packageId } = buildSealedAndVerifiedDecisionPacket();
    const manifest = required(runtime.getPackageManifest(packageId), 'Expected a manifest.');

    const first = runtime.serializer.serializeManifest(ctx, manifest);
    const second = runtime.serializer.serializeManifest(ctx, manifest);

    assertSerializedShape(first, 'verification_manifest');
    assert.equal(first.content, second.content);
    assert.equal(first.contentHash, second.contentHash);

    const parsed = JSON.parse(first.content) as { readonly manifestHash: string };
    assert.equal(parsed.manifestHash, manifest.manifestHash);
  });

  it('3. serializeIntegrityReport produces valid, deterministic JSON', () => {
    const { ctx, runtime, packageId } = buildSealedAndVerifiedDecisionPacket();
    const report = required(runtime.store.getIntegrityReportByPackage(packageId), 'Expected an integrity report after verifyPackage().');

    const first = runtime.serializer.serializeIntegrityReport(ctx, report);
    const second = runtime.serializer.serializeIntegrityReport(ctx, report);

    assertSerializedShape(first, 'integrity_report');
    assert.equal(first.content, second.content);
    assert.equal(first.contentHash, second.contentHash);

    const parsed = JSON.parse(first.content) as { readonly integrityHash: string };
    assert.equal(parsed.integrityHash, report.integrityHash);
  });

  it('4. serializeAuditBundleFragment produces valid, deterministic JSON', () => {
    const { ctx, runtime, packageId } = buildSealedAndVerifiedDecisionPacket();
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'audit-summary-1', {});

    const { auditBundle } = runtime.createAuditBundle({
      title: 'Audit bundle',
      description: 'An audit bundle referencing the sealed decision packet.',
      trustDomainId: 'trust-domain-1',
      scope: { trustDomainId: 'trust-domain-1', actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
      packageIds: [packageId],
      sections: [{ type: 'summary', required: true, items: [summaryItem] }],
    });

    const first = runtime.serializer.serializeAuditBundleFragment(ctx, auditBundle);
    const second = runtime.serializer.serializeAuditBundleFragment(ctx, auditBundle);

    assertSerializedShape(first, 'audit_bundle_fragment');
    assert.equal(first.content, second.content);
    assert.equal(first.contentHash, second.contentHash);

    const parsed = JSON.parse(first.content) as { readonly bundleHash: string };
    assert.equal(parsed.bundleHash, auditBundle.bundleHash);
  });

  it('5. contentHash changes when serialized content changes', () => {
    const { ctx, runtime, packageId } = buildSealedAndVerifiedDecisionPacket();
    const manifest = required(runtime.getPackageManifest(packageId), 'Expected a manifest.');
    const otherManifest = { ...manifest, manifestHash: 'a-different-manifest-hash' };

    const first = runtime.serializer.serializeManifest(ctx, manifest);
    const second = runtime.serializer.serializeManifest(ctx, otherManifest);

    assert.notEqual(first.content, second.content);
    assert.notEqual(first.contentHash, second.contentHash);
  });
});
