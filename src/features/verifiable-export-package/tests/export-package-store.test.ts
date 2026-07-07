import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import type { ExportPackage } from '../domain/export-package.js';
import type { ExportPackageSection, ExportPackageSectionType } from '../domain/export-package-section.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import type { ExportPackageReference } from '../domain/export-package-reference.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import type { ExportPackageIntegrityReport } from '../domain/export-package-integrity.js';
import type { ExportPackageVerification } from '../domain/export-package-verification.js';
import type { SerializedExportPackage } from '../domain/export-package-format.js';
import type { DecisionPacket } from '../domain/decision-packet.js';
import type { AuditBundle } from '../domain/audit-bundle.js';
import type { PackageSnapshot } from '../domain/package-snapshot.js';
import type { ExportPackageEvent, ExportPackageEventType } from '../domain/package-event.js';
import { ExportPackageStore, ExportPackageNotFoundError } from '../services/export-package-store.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeItem(
  id: string,
  type: ExportPackageItemType,
  sourceModule: ExportPackageItemSourceModule,
  sourceId: string,
  payload: Record<string, unknown> = {},
): ExportPackageItem {
  return {
    id,
    type,
    sourceModule,
    sourceId,
    title: `Item ${id}`,
    summary: `Summary for ${id}`,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: NOW,
  };
}

function makeSection(id: string, type: ExportPackageSectionType, items: readonly ExportPackageItem[] = []): ExportPackageSection {
  return {
    id,
    type,
    title: `Section ${id}`,
    description: 'A test section.',
    status: items.length > 0 ? 'included' : 'not_available',
    items,
    itemCount: items.length,
    sectionHash: createDigest({ type, items: items.map((item) => item.payloadHash) }),
    required: false,
    missingReferenceIds: [],
    createdAt: NOW,
  };
}

function makePackage(id: string, overrides: Partial<ExportPackage> = {}): ExportPackage {
  return {
    id,
    type: 'decision_packet',
    title: `Package ${id}`,
    description: 'A test package.',
    status: 'draft',
    trustDomainId: 'trust-domain-1',
    targetType: 'enforcement_decision',
    targetId: 'target-1',
    packageVersion: '1',
    sections: [],
    createdAt: NOW,
    ...overrides,
  };
}

function makeReference(id: string, fromItemId: string, toItemId: string, overrides: Partial<ExportPackageReference> = {}): ExportPackageReference {
  return {
    id,
    type: 'supports',
    fromItemId,
    toItemId,
    reasonCode: 'TEST_REASON',
    reason: 'Test reason.',
    createdAt: NOW,
    ...overrides,
  };
}

function makeManifest(id: string, packageId: string, overrides: Partial<ExportPackageManifest> = {}): ExportPackageManifest {
  return {
    id,
    packageId,
    packageVersion: '1',
    targetType: 'enforcement_decision',
    targetId: 'target-1',
    sectionHashes: [],
    itemHashes: [],
    referenceHashes: [],
    sourceModules: [],
    requiredSections: [],
    missingRequiredSections: [],
    createdAt: NOW,
    manifestHash: 'manifest-hash',
    ...overrides,
  };
}

function makeIntegrityReport(id: string, packageId: string, overrides: Partial<ExportPackageIntegrityReport> = {}): ExportPackageIntegrityReport {
  return {
    id,
    packageId,
    status: 'passed',
    sectionCount: 0,
    itemCount: 0,
    referenceCount: 0,
    verifiedSectionHashes: 0,
    verifiedItemHashes: 0,
    verifiedReferenceHashes: 0,
    missingRequiredSections: [],
    missingReferenceIds: [],
    issues: [],
    createdAt: NOW,
    integrityHash: 'integrity-hash',
    ...overrides,
  };
}

function makeVerification(id: string, packageId: string, overrides: Partial<ExportPackageVerification> = {}): ExportPackageVerification {
  return {
    id,
    packageId,
    status: 'verified',
    manifestHash: 'manifest-hash',
    packageHash: 'package-hash',
    verifiedManifest: true,
    verifiedPackageHash: true,
    verifiedSectionHashes: true,
    verifiedItemHashes: true,
    verifiedReferenceHashes: true,
    verifiedAt: NOW,
    issues: [],
    ...overrides,
  };
}

function makeSerializedArtifact(id: string, packageId: string, overrides: Partial<SerializedExportPackage> = {}): SerializedExportPackage {
  return {
    id,
    packageId,
    format: 'json_bundle',
    title: `Artifact ${id}`,
    content: '{}',
    contentHash: createDigest('{}'),
    createdAt: NOW,
    ...overrides,
  };
}

function makeDecisionPacket(id: string, packageId: string, overrides: Partial<DecisionPacket> = {}): DecisionPacket {
  return {
    id,
    packageId,
    targetType: 'enforcement_decision',
    targetId: 'target-1',
    decisionSummary: {},
    manifestId: 'manifest-1',
    packageHash: 'package-hash',
    createdAt: NOW,
    ...overrides,
  };
}

function makeAuditBundle(id: string, packageId: string, overrides: Partial<AuditBundle> = {}): AuditBundle {
  return {
    id,
    packageId,
    scope: { trustDomainId: 'trust-domain-1', actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
    packageIds: [packageId],
    summary: { packageCount: 1, decisionCount: 0, proofCount: 0, eventCount: 0, issueCount: 0 },
    bundleHash: 'bundle-hash',
    createdAt: NOW,
    ...overrides,
  };
}

function makePackageSnapshot(id: string, packageId: string, overrides: Partial<PackageSnapshot> = {}): PackageSnapshot {
  return {
    id,
    packageId,
    targetType: 'enforcement_decision',
    targetId: 'target-1',
    sections: [],
    createdAt: NOW,
    ...overrides,
  };
}

function makeEvent(id: string, type: ExportPackageEventType, overrides: Partial<ExportPackageEvent> = {}): ExportPackageEvent {
  return {
    id,
    type,
    timestamp: NOW,
    payload: {},
    eventHash: createDigest({ id, type }),
    ...overrides,
  };
}

describe('ExportPackageStore', () => {
  it('1. stores and retrieves an ExportPackage', () => {
    const store = new ExportPackageStore();
    const pkg = makePackage('package-1');
    store.savePackage(pkg);
    assert.deepEqual(store.getPackage('package-1'), pkg);
  });

  it('2. stores and retrieves an ExportPackageSection via package.sections', () => {
    const store = new ExportPackageStore();
    const item = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const section = makeSection('section-1', 'policy', [item]);
    const pkg = makePackage('package-1', { sections: [section] });
    store.savePackage(pkg);
    assert.deepEqual(store.getSection('section-1'), section);
    assert.deepEqual(store.listSectionsByPackage('package-1'), [section]);
  });

  it('3. stores and retrieves an ExportPackageItem', () => {
    const store = new ExportPackageStore();
    const item = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const section = makeSection('section-1', 'policy', [item]);
    store.savePackage(makePackage('package-1', { sections: [section] }));
    assert.deepEqual(store.getItem('item-1'), item);
    assert.deepEqual(store.listItems(), [item]);
    assert.deepEqual(store.listItemsByPackage('package-1'), [item]);
  });

  it('4. stores and retrieves an ExportPackageReference', () => {
    const store = new ExportPackageStore();
    const reference = makeReference('reference-1', 'item-1', 'item-2');
    store.saveReference(reference);
    assert.deepEqual(store.getReference('reference-1'), reference);
  });

  it('5. stores and retrieves an ExportPackageManifest', () => {
    const store = new ExportPackageStore();
    const manifest = makeManifest('manifest-1', 'package-1');
    store.saveManifest(manifest);
    assert.deepEqual(store.getManifest('manifest-1'), manifest);
    assert.deepEqual(store.getManifestByPackage('package-1'), manifest);
  });

  it('6. stores and retrieves an ExportPackageIntegrityReport', () => {
    const store = new ExportPackageStore();
    const report = makeIntegrityReport('report-1', 'package-1');
    store.saveIntegrityReport(report);
    assert.deepEqual(store.getIntegrityReport('report-1'), report);
    assert.deepEqual(store.getIntegrityReportByPackage('package-1'), report);
  });

  it('7. stores and retrieves an ExportPackageVerification', () => {
    const store = new ExportPackageStore();
    const verification = makeVerification('verification-1', 'package-1');
    store.saveVerification(verification);
    assert.deepEqual(store.getVerification('verification-1'), verification);
    assert.deepEqual(store.listVerificationsByPackage('package-1'), [verification]);
    assert.deepEqual(store.getLatestVerificationByPackage('package-1'), verification);
  });

  it('8. stores and retrieves a SerializedExportPackage', () => {
    const store = new ExportPackageStore();
    const artifact = makeSerializedArtifact('artifact-1', 'package-1');
    store.saveSerializedArtifact(artifact);
    assert.deepEqual(store.getSerializedArtifact('artifact-1'), artifact);
    assert.deepEqual(store.listSerializedArtifactsByPackage('package-1'), [artifact]);
  });

  it('9. stores and retrieves a DecisionPacket', () => {
    const store = new ExportPackageStore();
    const packet = makeDecisionPacket('packet-1', 'package-1');
    store.saveDecisionPacket(packet);
    assert.deepEqual(store.getDecisionPacket('packet-1'), packet);
    assert.deepEqual(store.getDecisionPacketByPackage('package-1'), packet);
  });

  it('10. stores and retrieves an AuditBundle', () => {
    const store = new ExportPackageStore();
    const bundle = makeAuditBundle('bundle-1', 'package-1');
    store.saveAuditBundle(bundle);
    assert.deepEqual(store.getAuditBundle('bundle-1'), bundle);
    assert.deepEqual(store.listAuditBundles(), [bundle]);
  });

  it('11. stores and retrieves a PackageSnapshot', () => {
    const store = new ExportPackageStore();
    const snapshot = makePackageSnapshot('snapshot-1', 'package-1');
    store.savePackageSnapshot(snapshot);
    assert.deepEqual(store.getPackageSnapshot('snapshot-1'), snapshot);
    assert.deepEqual(store.getPackageSnapshotByPackage('package-1'), snapshot);
  });

  it('12. stores and retrieves an ExportPackageEvent', () => {
    const store = new ExportPackageStore();
    const event = makeEvent('event-1', 'export_package_created');
    store.saveEvent(event);
    assert.deepEqual(store.getEvents(), [event]);
    assert.deepEqual(store.getLatestEvent(), event);
  });

  it('13. queries packages by targetType and targetId', () => {
    const store = new ExportPackageStore();
    const matching = makePackage('package-1', { targetType: 'enforcement_decision', targetId: 'target-1' });
    const other = makePackage('package-2', { targetType: 'policy_decision', targetId: 'target-2' });
    store.savePackage(matching);
    store.savePackage(other);
    assert.deepEqual(store.queryPackages({ targetType: 'enforcement_decision', targetId: 'target-1' }), [matching]);
  });

  it('14. queries packages by trustDomainId', () => {
    const store = new ExportPackageStore();
    const matching = makePackage('package-1', { trustDomainId: 'trust-domain-1' });
    const other = makePackage('package-2', { trustDomainId: 'trust-domain-2' });
    store.savePackage(matching);
    store.savePackage(other);
    assert.deepEqual(store.queryPackages({ trustDomainId: 'trust-domain-1' }), [matching]);
  });

  it('15. queries items by sourceModule and sourceId', () => {
    const store = new ExportPackageStore();
    const item = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const other = makeItem('item-2', 'policy_proof', 'domain_policy_pack_runtime', 'source-2');
    const section = makeSection('section-1', 'policy', [item, other]);
    store.savePackage(makePackage('package-1', { sections: [section] }));
    assert.deepEqual(store.queryItemsBySource('domain_policy_pack_runtime', 'source-1'), [item]);
  });

  it('16. queries references by fromItemId', () => {
    const store = new ExportPackageStore();
    const reference = makeReference('reference-1', 'item-1', 'item-2');
    const other = makeReference('reference-2', 'item-3', 'item-2');
    store.saveReference(reference);
    store.saveReference(other);
    assert.deepEqual(store.queryReferencesByFromItem('item-1'), [reference]);
  });

  it('17. queries references by toItemId', () => {
    const store = new ExportPackageStore();
    const reference = makeReference('reference-1', 'item-1', 'item-2');
    const other = makeReference('reference-2', 'item-1', 'item-3');
    store.saveReference(reference);
    store.saveReference(other);
    assert.deepEqual(store.queryReferencesByToItem('item-2'), [reference]);
  });

  it('18. preserves deterministic insertion ordering across list and query methods', () => {
    const store = new ExportPackageStore();
    store.savePackage(makePackage('package-3'));
    store.savePackage(makePackage('package-1'));
    store.savePackage(makePackage('package-2'));
    assert.deepEqual(
      store.listPackages().map((pkg) => pkg.id),
      ['package-3', 'package-1', 'package-2'],
    );
    assert.deepEqual(
      store.queryPackages({}).map((pkg) => pkg.id),
      ['package-3', 'package-1', 'package-2'],
    );

    store.saveReference(makeReference('reference-b', 'item-1', 'item-2'));
    store.saveReference(makeReference('reference-a', 'item-1', 'item-3'));
    assert.deepEqual(
      store.listReferences().map((reference) => reference.id),
      ['reference-b', 'reference-a'],
    );
  });

  it('19. updates package status via updatePackageStatus', () => {
    const store = new ExportPackageStore();
    store.savePackage(makePackage('package-1', { status: 'draft' }));
    const updated = store.updatePackageStatus('package-1', 'sealed', 'sealedAt', NOW);
    assert.equal(updated.status, 'sealed');
    assert.equal(updated.sealedAt, NOW);
    assert.equal(store.getPackage('package-1')?.status, 'sealed');
  });

  it('20. updatePackageStatus throws ExportPackageNotFoundError for an unknown package', () => {
    const store = new ExportPackageStore();
    assert.throws(() => store.updatePackageStatus('missing-package', 'sealed', undefined, undefined));
  });

  it('21. updates package hashes via updatePackageHashes', () => {
    const store = new ExportPackageStore();
    store.savePackage(makePackage('package-1'));
    const updated = store.updatePackageHashes('package-1', {
      packageHash: 'package-hash-1',
      previousPackageHash: 'previous-hash-1',
      manifestId: 'manifest-1',
      integrityReportId: 'report-1',
      verificationId: 'verification-1',
    });
    assert.equal(updated.packageHash, 'package-hash-1');
    assert.equal(updated.previousPackageHash, 'previous-hash-1');
    assert.equal(updated.manifestId, 'manifest-1');
    assert.equal(updated.integrityReportId, 'report-1');
    assert.equal(updated.verificationId, 'verification-1');
    assert.equal(store.getPackage('package-1')?.packageHash, 'package-hash-1');
  });

  it('22. updatePackageHashes throws ExportPackageNotFoundError for an unknown package', () => {
    const store = new ExportPackageStore();
    assert.throws(() => store.updatePackageHashes('missing-package', { packageHash: 'x' }), ExportPackageNotFoundError);
  });
});
