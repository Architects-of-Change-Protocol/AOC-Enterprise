import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import { createExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import type { ExportPackageReference } from '../domain/export-package-reference.js';
import type { ExportPackageSection } from '../domain/export-package-section.js';
import { ExportPackageHashService } from '../services/export-package-hash-service.js';
import { buildEnforcementSection, buildSummarySection } from '../services/export-package-section-builder.js';
import { ExportPackageManifestService, REQUIRED_SECTIONS_BY_PACKAGE_TYPE, type CreateManifestInput } from '../services/export-package-manifest-service.js';

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

function setup() {
  const ctx = createExportRuntimeContext(NOW);
  const hashService = new ExportPackageHashService();
  const manifestService = new ExportPackageManifestService(hashService);
  return { ctx, hashService, manifestService };
}

function makeReference(id: string, fromItemId: string, toItemId: string): ExportPackageReference {
  return {
    id,
    type: 'verifies',
    fromItemId,
    toItemId,
    reasonCode: 'POLICY_PROOF_VERIFIES_DECISION',
    reason: 'test reference',
    createdAt: NOW,
  };
}

describe('ExportPackageManifestService', () => {
  it('1. createManifest produces one entry per section, item, and reference', () => {
    const { ctx, hashService, manifestService } = setup();
    const item1 = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const item2 = makeItem('item-2', 'policy_proof', 'domain_policy_pack_runtime', 'source-2', { decisionId: 'source-1' });
    const item3 = makeItem('item-3', 'enforcement_decision', 'action_enforcement', 'source-3');

    const summarySection = buildSummarySection(ctx, hashService, [item1], true);
    const enforcementSection = buildEnforcementSection(ctx, hashService, [item2, item3], true);
    const reference = makeReference('reference-1', 'item-2', 'item-1');

    const manifest = manifestService.createManifest(ctx, {
      packageId: 'package-1',
      packageType: 'decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections: [summarySection, enforcementSection],
      references: [reference],
    });

    assert.equal(manifest.sectionHashes.length, 2);
    assert.deepEqual(
      manifest.sectionHashes.map((entry) => ({ sectionId: entry.sectionId, sectionType: entry.sectionType })),
      [
        { sectionId: summarySection.id, sectionType: 'summary' },
        { sectionId: enforcementSection.id, sectionType: 'enforcement' },
      ],
    );

    assert.equal(manifest.itemHashes.length, 3);
    assert.deepEqual(
      manifest.itemHashes.map((entry) => entry.itemId),
      ['item-1', 'item-2', 'item-3'],
    );
    assert.deepEqual(
      manifest.itemHashes.map((entry) => entry.itemType),
      ['policy_decision', 'policy_proof', 'enforcement_decision'],
    );

    assert.equal(manifest.referenceHashes.length, 1);
    assert.equal(manifest.referenceHashes[0]?.referenceId, 'reference-1');
  });

  it('2. requiredSections matches REQUIRED_SECTIONS_BY_PACKAGE_TYPE for decision_packet and evidence_packet', () => {
    assert.deepEqual(REQUIRED_SECTIONS_BY_PACKAGE_TYPE.decision_packet, ['summary', 'enforcement']);
    assert.deepEqual(REQUIRED_SECTIONS_BY_PACKAGE_TYPE.evidence_packet, ['summary', 'evidence']);

    const { ctx, hashService, manifestService } = setup();
    const item1 = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const summarySection = buildSummarySection(ctx, hashService, [item1], true);
    const manifest = manifestService.createManifest(ctx, {
      packageId: 'package-1',
      packageType: 'decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections: [summarySection],
      references: [],
    });
    assert.deepEqual(manifest.requiredSections, REQUIRED_SECTIONS_BY_PACKAGE_TYPE.decision_packet);
  });

  it('3. missingRequiredSections is non-empty when a required section is absent entirely', () => {
    const { ctx, hashService, manifestService } = setup();
    const item1 = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const summarySection = buildSummarySection(ctx, hashService, [item1], true);

    const manifest = manifestService.createManifest(ctx, {
      packageId: 'package-1',
      packageType: 'decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections: [summarySection],
      references: [],
    });
    assert.deepEqual(manifest.missingRequiredSections, ['enforcement']);
  });

  it('4. missingRequiredSections is non-empty when a required section is present but not_available', () => {
    const { ctx, hashService, manifestService } = setup();
    const item1 = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const summarySection = buildSummarySection(ctx, hashService, [item1], true);
    const emptyEnforcementSection = buildEnforcementSection(ctx, hashService, [], true);
    assert.equal(emptyEnforcementSection.status, 'not_available');

    const manifest = manifestService.createManifest(ctx, {
      packageId: 'package-1',
      packageType: 'decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections: [summarySection, emptyEnforcementSection],
      references: [],
    });
    assert.deepEqual(manifest.missingRequiredSections, ['enforcement']);
  });

  it('5. missingRequiredSections is empty when all required sections are present with items', () => {
    const { ctx, hashService, manifestService } = setup();
    const item1 = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const item2 = makeItem('item-2', 'enforcement_decision', 'action_enforcement', 'source-2');
    const summarySection = buildSummarySection(ctx, hashService, [item1], true);
    const enforcementSection = buildEnforcementSection(ctx, hashService, [item2], true);

    const manifest = manifestService.createManifest(ctx, {
      packageId: 'package-1',
      packageType: 'decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections: [summarySection, enforcementSection],
      references: [],
    });
    assert.deepEqual(manifest.missingRequiredSections, []);
  });

  it('6. manifestHash is deterministic across fresh contexts with the same input', () => {
    const setupA = setup();
    const setupB = setup();
    const item1A = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const item1B = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const summarySectionA = buildSummarySection(setupA.ctx, setupA.hashService, [item1A], true);
    const summarySectionB = buildSummarySection(setupB.ctx, setupB.hashService, [item1B], true);
    setupB.ctx.ids.nextId('noise'); // shifts only setupB's *manifest* id so manifest.id differs while sectionId stays aligned

    const buildInput = (sections: readonly ExportPackageSection[]): CreateManifestInput => ({
      packageId: 'package-1',
      packageType: 'decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections,
      references: [],
    });

    const manifestA = setupA.manifestService.createManifest(setupA.ctx, buildInput([summarySectionA]));
    const manifestB = setupB.manifestService.createManifest(setupB.ctx, buildInput([summarySectionB]));

    assert.notEqual(manifestA.id, manifestB.id);
    assert.equal(manifestA.manifestHash, manifestB.manifestHash);
  });

  it('7. changing a section sectionHash changes the resulting manifestHash', () => {
    const { ctx, hashService, manifestService } = setup();
    const item1 = makeItem('item-1', 'enforcement_decision', 'action_enforcement', 'source-1');
    const item2 = makeItem('item-2', 'enforcement_decision', 'action_enforcement', 'source-2');
    const enforcementSectionA = buildEnforcementSection(ctx, hashService, [item1], true);
    const enforcementSectionB = buildEnforcementSection(ctx, hashService, [item2], true);
    assert.notEqual(enforcementSectionA.sectionHash, enforcementSectionB.sectionHash);

    const manifestA = manifestService.createManifest(ctx, {
      packageId: 'package-1',
      packageType: 'enforcement_decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections: [enforcementSectionA],
      references: [],
    });
    const manifestB = manifestService.createManifest(ctx, {
      packageId: 'package-1',
      packageType: 'enforcement_decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections: [enforcementSectionB],
      references: [],
    });
    assert.notEqual(manifestA.manifestHash, manifestB.manifestHash);
  });

  it('8. verifyManifest returns true for a manifest exactly as createManifest produced it', () => {
    const { ctx, hashService, manifestService } = setup();
    const item1 = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const summarySection = buildSummarySection(ctx, hashService, [item1], true);
    const manifest = manifestService.createManifest(ctx, {
      packageId: 'package-1',
      packageType: 'decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections: [summarySection],
      references: [],
    });
    assert.equal(manifestService.verifyManifest(manifest), true);
  });

  it('9. verifyManifest returns false when manifestHash is mutated', () => {
    const { ctx, hashService, manifestService } = setup();
    const item1 = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const summarySection = buildSummarySection(ctx, hashService, [item1], true);
    const manifest = manifestService.createManifest(ctx, {
      packageId: 'package-1',
      packageType: 'decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections: [summarySection],
      references: [],
    });
    const tampered = { ...manifest, manifestHash: `${manifest.manifestHash}-tampered` };
    assert.equal(manifestService.verifyManifest(tampered), false);
  });

  it('10. verifyManifest returns false when a hash array is mutated', () => {
    const { ctx, hashService, manifestService } = setup();
    const item1 = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const summarySection = buildSummarySection(ctx, hashService, [item1], true);
    const manifest = manifestService.createManifest(ctx, {
      packageId: 'package-1',
      packageType: 'decision_packet',
      packageVersion: '1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      sections: [summarySection],
      references: [],
    });
    const tampered = { ...manifest, sectionHashes: [{ ...manifest.sectionHashes[0]!, sectionHash: 'tampered-hash' }] };
    assert.equal(manifestService.verifyManifest(tampered), false);
  });
});
