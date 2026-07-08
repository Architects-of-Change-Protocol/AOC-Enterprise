import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackage } from '../domain/export-package.js';
import type { ExportPackageSection, ExportPackageSectionType } from '../domain/export-package-section.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import type { ExportPackageReference } from '../domain/export-package-reference.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import type { ExportPackageIntegrityIssueSeverity } from '../domain/export-package-integrity.js';
import { ExportPackageHashService } from '../services/export-package-hash-service.js';
import { ExportPackageIntegrityService } from '../services/export-package-integrity-service.js';
import { createExportPackageRuntime, ExportPackageRuntime } from '../services/export-package-runtime.js';

const NOW = '2026-01-01T00:00:00.000Z';
const hashService = new ExportPackageHashService();
const integrityService = new ExportPackageIntegrityService(hashService);
const ALLOWED_SEVERITIES: readonly string[] = ['info', 'warning', 'error', 'critical'];
const SEVERITY_RANK: Readonly<Record<ExportPackageIntegrityIssueSeverity, number>> = { critical: 0, error: 1, warning: 2, info: 3 };

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

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

function makeSection(id: string, type: ExportPackageSectionType, items: readonly ExportPackageItem[], required_ = false): ExportPackageSection {
  return {
    id,
    type,
    title: `Section ${id}`,
    description: 'A test section.',
    status: items.length > 0 ? 'included' : 'not_available',
    items,
    itemCount: items.length,
    sectionHash: hashService.hashSection({ type, required: required_, items }),
    required: required_,
    missingReferenceIds: [],
    createdAt: NOW,
  };
}

function makePackage(id: string, sections: readonly ExportPackageSection[], overrides: Partial<ExportPackage> = {}): ExportPackage {
  return {
    id,
    type: 'decision_packet',
    title: `Package ${id}`,
    description: 'A test package.',
    status: 'draft',
    trustDomainId: 'trust-domain-1',
    targetType: 'enforcement_decision',
    targetId: 'target-1',
    packageVersion: '1.0.0',
    sections,
    createdAt: NOW,
    ...overrides,
  };
}

function makeManifest(packageId: string, overrides: Partial<ExportPackageManifest> = {}): ExportPackageManifest {
  return {
    id: 'manifest-1',
    packageId,
    packageVersion: '1.0.0',
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

function makeRuntimeItem(
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

interface CleanDecisionPacket {
  readonly ctx: ExportRuntimeContext;
  readonly runtime: ExportPackageRuntime;
  readonly pkg: ExportPackage;
  readonly manifest: ExportPackageManifest;
  readonly references: readonly ExportPackageReference[];
}

/** Builds a genuinely sealed, satisfies-required-sections `decision_packet` via the real runtime, for tamper-based tests. */
function buildCleanDecisionPacket(): CleanDecisionPacket {
  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);
  const summaryItem = makeRuntimeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', { text: 'hello' });
  const decisionItem = makeRuntimeItem(ctx, 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1', { allowedToExecute: true, reasonCode: 'OK', reason: 'ok' });
  const proofItem = makeRuntimeItem(ctx, 'enforcement_proof', 'action_enforcement', 'enforcement-proof-1', { enforcementDecisionId: 'enforcement-decision-1' });

  const created = runtime.createDecisionPacket({
    title: 'Decision packet',
    description: 'A clean decision packet satisfying all required sections.',
    trustDomainId: 'trust-domain-1',
    targetType: 'enforcement_decision',
    targetId: 'enforcement-decision-1',
    sections: [
      { type: 'summary', required: true, items: [summaryItem] },
      { type: 'enforcement', required: true, items: [decisionItem, proofItem] },
    ],
  });

  runtime.sealPackage(created.pkg.id);
  const pkg = required(runtime.getPackage(created.pkg.id), 'Expected the sealed package to be stored.');
  const manifest = required(runtime.getPackageManifest(created.pkg.id), 'Expected a manifest for the sealed package.');
  const references = runtime.store.listReferences().filter((reference) => manifest.referenceHashes.some((entry) => entry.referenceId === reference.id));

  return { ctx, runtime, pkg, manifest, references };
}

function tamperFirstItemPayload(pkg: ExportPackage, sectionIndex: number): ExportPackage {
  return {
    ...pkg,
    sections: pkg.sections.map((section, index) =>
      index === sectionIndex
        ? { ...section, items: section.items.map((item, itemIndex) => (itemIndex === 0 ? { ...item, payload: { ...item.payload, tampered: true } } : item)) }
        : section,
    ),
  };
}

describe('ExportPackageIntegrityService', () => {
  it('1. detects a missing required section (MISSING_REQUIRED_SECTION)', () => {
    const ctx = createExportRuntimeContext(NOW);
    const runtime = createExportPackageRuntime(ctx);
    const summaryItem = makeRuntimeItem(ctx, 'summary_text', 'verifiable_export_package', 'summary-1', {});
    const { pkg, manifest } = runtime.createDecisionPacket({
      title: 'Incomplete decision packet',
      description: 'Missing the required enforcement section entirely.',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-1',
      sections: [{ type: 'summary', required: true, items: [summaryItem] }],
    });

    assert.deepEqual(manifest.missingRequiredSections, ['enforcement']);

    const report = runtime.integrityService.createIntegrityReport(ctx, pkg, manifest, []);
    assert.equal(report.status, 'failed');
    assert.ok(report.issues.some((issue) => issue.reasonCode === 'MISSING_REQUIRED_SECTION'));
  });

  it('2. detects an item payload hash mismatch (ITEM_PAYLOAD_HASH_MISMATCH)', () => {
    const clean = buildCleanDecisionPacket();
    const tamperedPkg = tamperFirstItemPayload(clean.pkg, 1);

    const report = clean.runtime.integrityService.createIntegrityReport(clean.ctx, tamperedPkg, clean.manifest, clean.references);
    const issue = required(
      report.issues.find((candidate) => candidate.reasonCode === 'ITEM_PAYLOAD_HASH_MISMATCH'),
      'Expected an ITEM_PAYLOAD_HASH_MISMATCH issue.',
    );
    assert.equal(issue.severity, 'critical');
    assert.equal(report.verifiedItemHashes < report.itemCount, true);
  });

  it('3. detects a section hash mismatch (SECTION_HASH_MISMATCH)', () => {
    const clean = buildCleanDecisionPacket();
    const tamperedPkg: ExportPackage = {
      ...clean.pkg,
      sections: clean.pkg.sections.map((section, index) => (index === 0 ? { ...section, sectionHash: 'tampered-section-hash' } : section)),
    };

    const report = clean.runtime.integrityService.createIntegrityReport(clean.ctx, tamperedPkg, clean.manifest, clean.references);
    const issue = required(
      report.issues.find((candidate) => candidate.reasonCode === 'SECTION_HASH_MISMATCH'),
      'Expected a SECTION_HASH_MISMATCH issue.',
    );
    assert.equal(issue.severity, 'critical');
  });

  it('4. detects duplicate item ids across sections (DUPLICATE_ITEM_ID)', () => {
    const ctx = createExportRuntimeContext(NOW);
    const itemA = makeItem('item-dup', 'summary_text', 'verifiable_export_package', 'src-a');
    const itemB = makeItem('item-dup', 'evidence_artifact', 'verifiable_export_package', 'src-b');
    const summarySection = makeSection('section-summary', 'summary', [itemA], true);
    const evidenceSection = makeSection('section-evidence', 'evidence', [itemB], false);
    const pkg = makePackage('pkg-dup-item', [summarySection, evidenceSection]);
    const manifest = makeManifest('pkg-dup-item', { missingRequiredSections: [] });

    const report = integrityService.createIntegrityReport(ctx, pkg, manifest, []);
    assert.ok(report.issues.some((issue) => issue.reasonCode === 'DUPLICATE_ITEM_ID' && issue.itemId === 'item-dup'));
  });

  it('5. detects duplicate section ids (DUPLICATE_SECTION_ID)', () => {
    const ctx = createExportRuntimeContext(NOW);
    const itemA = makeItem('item-a', 'summary_text', 'verifiable_export_package', 'src-a');
    const itemB = makeItem('item-b', 'evidence_artifact', 'verifiable_export_package', 'src-b');
    const sectionA = makeSection('section-dup', 'summary', [itemA], true);
    const sectionB = makeSection('section-dup', 'evidence', [itemB], false);
    const pkg = makePackage('pkg-dup-section', [sectionA, sectionB]);
    const manifest = makeManifest('pkg-dup-section', { missingRequiredSections: [] });

    const report = integrityService.createIntegrityReport(ctx, pkg, manifest, []);
    assert.ok(report.issues.some((issue) => issue.reasonCode === 'DUPLICATE_SECTION_ID' && issue.sectionId === 'section-dup'));
  });

  it('6. detects a manifest reference hash entry with no matching reference (REFERENCE_NOT_FOUND)', () => {
    const ctx = createExportRuntimeContext(NOW);
    const summaryItem = makeItem('item-summary', 'summary_text', 'verifiable_export_package', 'src-summary');
    const summarySection = makeSection('section-summary', 'summary', [summaryItem], true);
    const pkg = makePackage('pkg-ref-not-found', [summarySection]);
    const manifest = makeManifest('pkg-ref-not-found', {
      missingRequiredSections: [],
      referenceHashes: [{ referenceId: 'reference-does-not-exist', referenceHash: 'whatever-hash' }],
    });

    const report = integrityService.createIntegrityReport(ctx, pkg, manifest, []);
    assert.ok(report.issues.some((issue) => issue.reasonCode === 'REFERENCE_NOT_FOUND' && issue.referenceId === 'reference-does-not-exist'));
  });

  it('7. detects a reference pointing to an item outside the package (REFERENCE_TO_UNKNOWN_ITEM)', () => {
    const ctx = createExportRuntimeContext(NOW);
    const summaryItem = makeItem('item-summary', 'summary_text', 'verifiable_export_package', 'src-summary');
    const summarySection = makeSection('section-summary', 'summary', [summaryItem], true);
    const pkg = makePackage('pkg-ref-unknown', [summarySection]);

    const badReference: ExportPackageReference = {
      id: 'reference-bad',
      type: 'verifies',
      fromItemId: 'item-does-not-exist',
      toItemId: summaryItem.id,
      reasonCode: 'TEST_REASON',
      reason: 'A reference pointing outside the package.',
      createdAt: NOW,
    };
    const referenceHash = hashService.hashReference({ type: badReference.type, fromItemId: badReference.fromItemId, toItemId: badReference.toItemId, reasonCode: badReference.reasonCode });
    const manifest = makeManifest('pkg-ref-unknown', {
      missingRequiredSections: [],
      referenceHashes: [{ referenceId: badReference.id, referenceHash }],
    });

    const report = integrityService.createIntegrityReport(ctx, pkg, manifest, [badReference]);
    assert.ok(report.issues.some((issue) => issue.reasonCode === 'REFERENCE_TO_UNKNOWN_ITEM' && issue.referenceId === badReference.id));
  });

  it('8. detects a package target that does not match its target item (PACKAGE_TARGET_MISMATCH)', () => {
    const ctx = createExportRuntimeContext(NOW);
    const summaryItem = makeItem('item-summary', 'summary_text', 'verifiable_export_package', 'src-summary');
    const decisionItem = makeItem('item-decision', 'enforcement_decision', 'action_enforcement', 'enforcement-decision-1');
    const summarySection = makeSection('section-summary', 'summary', [summaryItem], true);
    const enforcementSection = makeSection('section-enforcement', 'enforcement', [decisionItem], true);
    const pkg = makePackage('pkg-target-mismatch', [summarySection, enforcementSection], { targetType: 'enforcement_decision', targetId: 'some-other-target' });
    const manifest = makeManifest('pkg-target-mismatch', { missingRequiredSections: [] });

    const report = integrityService.createIntegrityReport(ctx, pkg, manifest, []);
    const issue = required(
      report.issues.find((candidate) => candidate.reasonCode === 'PACKAGE_TARGET_MISMATCH'),
      'Expected a PACKAGE_TARGET_MISMATCH issue.',
    );
    assert.equal(issue.severity, 'critical');
  });

  it('9. classifies every issue severity within the defined severity set', () => {
    const clean = buildCleanDecisionPacket();
    const tamperedPkg = tamperFirstItemPayload(clean.pkg, 1);
    const report = clean.runtime.integrityService.createIntegrityReport(clean.ctx, tamperedPkg, clean.manifest, clean.references);

    assert.ok(report.issues.length > 0);
    for (const issue of report.issues) {
      assert.ok(ALLOWED_SEVERITIES.includes(issue.severity));
    }
  });

  it('10. produces a deterministic integrityHash for identical inputs from fresh contexts', () => {
    function build(): string {
      const clean = buildCleanDecisionPacket();
      const report = clean.runtime.integrityService.createIntegrityReport(clean.ctx, clean.pkg, clean.manifest, clean.references);
      return report.integrityHash;
    }
    const hashA = build();
    const hashB = build();
    assert.equal(hashA, hashB);
  });

  it('11. sorts issues deterministically (critical before warning; stable across rebuilds)', () => {
    function build(): ReturnType<ExportPackageIntegrityService['createIntegrityReport']> {
      const ctx = createExportRuntimeContext(NOW);
      const itemA = makeItem('item-dup', 'summary_text', 'verifiable_export_package', 'src-a');
      const itemB = makeItem('item-dup', 'evidence_artifact', 'verifiable_export_package', 'src-b');
      const summarySection = makeSection('section-summary', 'summary', [itemA], true);
      const evidenceSectionBase = makeSection('section-evidence', 'evidence', [itemB], false);
      const evidenceSection: ExportPackageSection = { ...evidenceSectionBase, status: 'incomplete', missingReferenceIds: ['missing-ref-1'] };
      const pkg = makePackage('pkg-order', [summarySection, evidenceSection], { type: 'evidence_packet' });
      const manifest = makeManifest('pkg-order', { missingRequiredSections: [] });
      return integrityService.createIntegrityReport(ctx, pkg, manifest, []);
    }

    const reportA = build();
    const reportB = build();

    assert.deepEqual(
      reportA.issues.map((issue) => issue.reasonCode),
      reportB.issues.map((issue) => issue.reasonCode),
    );

    const criticalIndex = reportA.issues.findIndex((issue) => issue.reasonCode === 'DUPLICATE_ITEM_ID');
    const warningIndex = reportA.issues.findIndex((issue) => issue.reasonCode === 'MISSING_REFERENCE');
    assert.ok(criticalIndex >= 0);
    assert.ok(warningIndex >= 0);
    assert.ok(criticalIndex < warningIndex);

    let previousRank = -1;
    for (const issue of reportA.issues) {
      const rank = SEVERITY_RANK[issue.severity];
      assert.ok(rank >= previousRank);
      previousRank = rank;
    }
  });
});
