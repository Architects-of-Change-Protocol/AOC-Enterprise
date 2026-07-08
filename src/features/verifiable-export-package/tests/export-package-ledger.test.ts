import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import type { ExportPackageEventType } from '../domain/package-event.js';
import { ExportPackageStore } from '../services/export-package-store.js';
import { createExportPackageLedger } from '../services/export-package-ledger.js';
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

interface LedgerWorld {
  readonly ctx: ExportRuntimeContext;
  readonly runtime: ExportPackageRuntime;
  readonly packageId: string;
}

/** Runs a package through its full lifecycle -- create (with a reference-producing item pair), seal, verify, serialize, plus an audit bundle. */
function runFullLifecycle(): LedgerWorld {
  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const summaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
  const decisionItem = makeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', {});
  const proofItem = makeItem(ctx, 'enforcement_proof', 'action_enforcement', 'enforcement-proof-1', { enforcementDecisionId: 'enforcement-decision-1' });

  const { pkg } = runtime.createDecisionPacket({
    title: 'Ledger lifecycle test package',
    description: 'A package exercising every ledger event type.',
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
  runtime.serializePackage(pkg.id, 'json_bundle');

  const auditSummaryItem = makeItem(ctx, 'summary_text', 'verifiable_export_package', 'audit-summary-1', {});
  runtime.createAuditBundle({
    title: 'Audit bundle',
    description: 'An audit bundle referencing the lifecycle package.',
    trustDomainId: 'trust-domain-1',
    scope: { trustDomainId: 'trust-domain-1', actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
    packageIds: [pkg.id],
    sections: [{ type: 'summary', required: true, items: [auditSummaryItem] }],
  });

  return { ctx, runtime, packageId: pkg.id };
}

describe('ExportPackageLedger', () => {
  it('1. records every event type produced by a normal package lifecycle', () => {
    const { runtime } = runFullLifecycle();
    const eventTypes = new Set(runtime.ledger.getEvents().map((event) => event.type));

    const expectedTypes: readonly ExportPackageEventType[] = [
      'export_package_created',
      'export_package_section_created',
      'export_package_item_added',
      'export_package_reference_created',
      'export_package_manifest_created',
      'export_package_sealed',
      'export_package_verified',
      'export_package_serialized',
      'audit_bundle_created',
    ];
    for (const type of expectedTypes) {
      assert.ok(eventTypes.has(type), `Expected the ledger to contain a "${type}" event.`);
    }
  });

  it('2. records export_package_verification_failed after a tampered re-verification', () => {
    const { runtime, packageId } = runFullLifecycle();
    runtime.store.updatePackageHashes(packageId, { packageHash: 'tampered-package-hash' });
    runtime.verifyPackage(packageId);

    const events = runtime.ledger.getEvents();
    const lastEvent = required(events[events.length - 1], 'Expected at least one recorded event.');
    assert.equal(lastEvent.type, 'export_package_verification_failed');
  });

  it('3. maintains a previousHash chain across all recorded events', () => {
    const { runtime } = runFullLifecycle();
    const events = runtime.ledger.getEvents();
    assert.ok(events.length > 1);
    const firstEvent = required(events[0], 'Expected at least one recorded event.');
    assert.equal(firstEvent.previousHash, undefined);

    let previousEventHash = firstEvent.eventHash;
    for (const event of events.slice(1)) {
      assert.equal(event.previousHash, previousEventHash);
      previousEventHash = event.eventHash;
    }
  });

  it('4. verifyChain returns true for an untampered ledger', () => {
    const { runtime } = runFullLifecycle();
    assert.equal(runtime.ledger.verifyChain(), true);
  });

  it('5. verifyChain returns false after a tampered event is pushed directly into the store', () => {
    const { runtime } = runFullLifecycle();
    assert.equal(runtime.ledger.verifyChain(), true);

    const events = runtime.ledger.getEvents();
    const lastEvent = required(events[events.length - 1], 'Expected at least one recorded event.');
    runtime.store.saveEvent({ ...lastEvent, eventHash: 'tampered-event-hash' });

    assert.equal(runtime.ledger.verifyChain(), false);
  });

  it('6. produces a deterministic eventHash for identical events recorded on independently-built ledgers', () => {
    function recordOne() {
      const ctx = createExportRuntimeContext(NOW);
      const store = new ExportPackageStore();
      const ledger = createExportPackageLedger(ctx, store);
      return ledger.recordEvent({ type: 'export_package_created', packageId: 'package-1', payload: { title: 'x' } });
    }
    const eventA = recordOne();
    const eventB = recordOne();
    assert.equal(eventA.eventHash, eventB.eventHash);
    assert.equal(eventA.previousHash, undefined);
    assert.equal(eventB.previousHash, undefined);
  });
});
