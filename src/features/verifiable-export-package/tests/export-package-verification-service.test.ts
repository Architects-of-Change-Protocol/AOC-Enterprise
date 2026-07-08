import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackage } from '../domain/export-package.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
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

interface CleanPackage {
  readonly ctx: ExportRuntimeContext;
  readonly runtime: ExportPackageRuntime;
  readonly packageId: string;
}

/** Builds and seals a `decision_packet` whose summary + enforcement sections are genuinely satisfied. */
function buildSealedDecisionPacket(includeExecution = false): CleanPackage {
  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);
  const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', { text: 'hello' });
  const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', { allowedToExecute: true, reasonCode: 'OK', reason: 'ok' });
  const proofItem = makeItem(ctx, 'enforcement_proof', 'action_enforcement', 'enforcement-proof-1', { enforcementDecisionId: 'enforcement-decision-1' });
  const executionItem = makeItem(ctx, 'execution_result', 'action_enforcement', 'execution-result-1', { executed: true });

  const { pkg } = runtime.createDecisionPacket({
    title: 'Decision packet',
    description: 'A clean, fully-satisfied decision packet.',
    trustDomainId: 'trust-domain-1',
    targetType: 'enforcement_decision',
    targetId: 'enforcement-decision-1',
    sections: [
      { type: 'summary', required: true, items: [summaryItem] },
      { type: 'enforcement', required: true, items: [decisionItem, proofItem] },
      ...(includeExecution ? [{ type: 'execution' as const, required: false, items: [executionItem] }] : []),
    ],
  });

  runtime.sealPackage(pkg.id);
  return { ctx, runtime, packageId: pkg.id };
}

describe('ExportPackageVerificationService', () => {
  it('1. verifies a complete, cleanly-sealed package', () => {
    const { runtime, packageId } = buildSealedDecisionPacket();
    const verification = runtime.verifyPackage(packageId);

    assert.equal(verification.status, 'verified');
    assert.equal(verification.verifiedManifest, true);
    assert.equal(verification.verifiedPackageHash, true);
    assert.equal(verification.verifiedSectionHashes, true);
    assert.equal(verification.verifiedItemHashes, true);
    assert.equal(verification.verifiedReferenceHashes, true);
    assert.ok(!verification.issues.some((issue) => issue.severity === 'critical'));

    const pkg = required(runtime.getPackage(packageId), 'Expected the package to be stored.');
    assert.equal(pkg.status, 'verified');
  });

  it('2. fails verification on a tampered packageHash', () => {
    const { runtime, packageId } = buildSealedDecisionPacket();
    runtime.verifyPackage(packageId);

    runtime.store.updatePackageHashes(packageId, { packageHash: 'tampered-package-hash' });
    const verification = runtime.verifyPackage(packageId);

    assert.equal(verification.status, 'failed');
    assert.equal(verification.verifiedPackageHash, false);
    const pkg = required(runtime.getPackage(packageId), 'Expected the package to be stored.');
    assert.equal(pkg.status, 'verification_failed');
  });

  it('3. fails verification on a tampered manifest hash', () => {
    const { runtime, packageId } = buildSealedDecisionPacket();
    const manifest = required(runtime.getPackageManifest(packageId), 'Expected a manifest.');

    runtime.store.saveManifest({ ...manifest, manifestHash: 'tampered-manifest-hash' });
    const verification = runtime.verifyPackage(packageId);

    assert.equal(verification.status, 'failed');
    assert.equal(verification.verifiedManifest, false);
    assert.equal(verification.verifiedPackageHash, false);
  });

  it('4. fails verification when a required section is entirely missing', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const { pkg } = runtime.createDecisionPacket({
      title: 'Missing enforcement section',
      description: 'Missing the required enforcement section.',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [{ type: 'summary', required: true, items: [summaryItem] }],
    });

    runtime.sealPackage(pkg.id);
    const verification = runtime.verifyPackage(pkg.id);
    assert.notEqual(verification.status, 'verified');
    assert.equal(verification.status, 'failed');
  });

  it('5. never fails verification purely because an optional, non-required section is absent', () => {
    const { runtime, packageId } = buildSealedDecisionPacket(false);
    const pkg = required(runtime.getPackage(packageId), 'Expected the package to be stored.');
    assert.ok(!pkg.sections.some((section) => section.type === 'execution'));

    const verification = runtime.verifyPackage(packageId);
    assert.notEqual(verification.status, 'failed');
    assert.ok(verification.status === 'verified' || verification.status === 'verified_with_warnings');
  });

  it('6. serialized json_bundle contentHash matches hashService.hashSerializedArtifact(content)', () => {
    const { runtime, packageId } = buildSealedDecisionPacket();
    runtime.verifyPackage(packageId);

    const artifact = runtime.serializePackage(packageId, 'json_bundle');
    assert.equal(artifact.contentHash, runtime.hashService.hashSerializedArtifact(artifact.content));
  });

  it('7. produces a deterministic verification result on an untampered package', () => {
    const { runtime, packageId } = buildSealedDecisionPacket();
    const first = runtime.verifyPackage(packageId);
    const second = runtime.verifyPackage(packageId);

    assert.notEqual(first.id, second.id);
    assert.equal(first.status, second.status);
    assert.equal(first.manifestHash, second.manifestHash);
    assert.equal(first.packageHash, second.packageHash);
    assert.equal(first.verifiedManifest, second.verifiedManifest);
    assert.equal(first.verifiedPackageHash, second.verifiedPackageHash);
    assert.equal(first.verifiedSectionHashes, second.verifiedSectionHashes);
    assert.equal(first.verifiedItemHashes, second.verifiedItemHashes);
    assert.equal(first.verifiedReferenceHashes, second.verifiedReferenceHashes);
    assert.deepEqual(
      first.issues.map((issue) => issue.reasonCode),
      second.issues.map((issue) => issue.reasonCode),
    );
  });
});
