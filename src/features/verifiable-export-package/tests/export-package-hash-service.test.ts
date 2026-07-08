import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDigest } from '../domain/export-package.js';
import type { ExportPackageItem, ExportPackageItemSourceModule, ExportPackageItemType } from '../domain/export-package-item.js';
import { ExportPackageHashService, type HashManifestInput } from '../services/export-package-hash-service.js';

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

function baseManifestInput(): HashManifestInput {
  return {
    packageId: 'package-1',
    packageVersion: '1',
    targetType: 'enforcement_decision',
    targetId: 'target-1',
    sectionHashes: [{ sectionId: 'section-1', sectionType: 'summary', sectionHash: 'section-hash-1' }],
    itemHashes: [{ itemId: 'item-1', itemType: 'policy_decision', sourceModule: 'domain_policy_pack_runtime', sourceId: 'source-1', payloadHash: 'payload-hash-1' }],
    referenceHashes: [{ referenceId: 'reference-1', referenceHash: 'reference-hash-1' }],
    requiredSections: ['summary'],
    missingRequiredSections: [],
  };
}

describe('ExportPackageHashService', () => {
  it('1. stableStringify is deterministic regardless of key insertion order', () => {
    const hashService = new ExportPackageHashService();
    const a = hashService.stableStringify({ alpha: 1, beta: 2, gamma: 3 });
    const b = hashService.stableStringify({ gamma: 3, alpha: 1, beta: 2 });
    assert.equal(a, b);
  });

  it('2. hashPayload is deterministic', () => {
    const hashService = new ExportPackageHashService();
    const payload = { decisionId: 'decision-1', allowed: true };
    assert.equal(hashService.hashPayload(payload), hashService.hashPayload(payload));
    assert.equal(hashService.hashPayload({ decisionId: 'decision-1', allowed: true }), hashService.hashPayload({ allowed: true, decisionId: 'decision-1' }));
  });

  it('3. hashSection is deterministic and changes when items change', () => {
    const hashService = new ExportPackageHashService();
    const item1 = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1');
    const item2 = makeItem('item-2', 'policy_proof', 'domain_policy_pack_runtime', 'source-2');
    const a = hashService.hashSection({ type: 'policy', required: true, items: [item1] });
    const b = hashService.hashSection({ type: 'policy', required: true, items: [item1] });
    const withMoreItems = hashService.hashSection({ type: 'policy', required: true, items: [item1, item2] });
    assert.equal(a, b);
    assert.notEqual(a, withMoreItems);
  });

  it('4. hashReference is deterministic and changes when fromItemId changes', () => {
    const hashService = new ExportPackageHashService();
    const base = { type: 'verifies' as const, fromItemId: 'item-1', toItemId: 'item-2', reasonCode: 'REASON' };
    assert.equal(hashService.hashReference(base), hashService.hashReference({ ...base }));
    assert.notEqual(hashService.hashReference(base), hashService.hashReference({ ...base, fromItemId: 'item-9' }));
  });

  it('5. hashReference changes when toItemId changes', () => {
    const hashService = new ExportPackageHashService();
    const base = { type: 'verifies' as const, fromItemId: 'item-1', toItemId: 'item-2', reasonCode: 'REASON' };
    assert.notEqual(hashService.hashReference(base), hashService.hashReference({ ...base, toItemId: 'item-9' }));
  });

  it('6. hashReference changes when type changes', () => {
    const hashService = new ExportPackageHashService();
    const base = { type: 'verifies' as const, fromItemId: 'item-1', toItemId: 'item-2', reasonCode: 'REASON' };
    assert.notEqual(hashService.hashReference(base), hashService.hashReference({ ...base, type: 'supports' }));
  });

  it('7. hashReference changes when reasonCode changes', () => {
    const hashService = new ExportPackageHashService();
    const base = { type: 'verifies' as const, fromItemId: 'item-1', toItemId: 'item-2', reasonCode: 'REASON' };
    assert.notEqual(hashService.hashReference(base), hashService.hashReference({ ...base, reasonCode: 'OTHER_REASON' }));
  });

  it('8. hashManifest is deterministic and changes when sectionHashes changes', () => {
    const hashService = new ExportPackageHashService();
    const input = baseManifestInput();
    assert.equal(hashService.hashManifest(input), hashService.hashManifest({ ...input }));
    const changed: HashManifestInput = { ...input, sectionHashes: [{ sectionId: 'section-2', sectionType: 'evidence', sectionHash: 'section-hash-2' }] };
    assert.notEqual(hashService.hashManifest(input), hashService.hashManifest(changed));
  });

  it('9. hashManifest changes when itemHashes changes', () => {
    const hashService = new ExportPackageHashService();
    const input = baseManifestInput();
    const changed: HashManifestInput = {
      ...input,
      itemHashes: [{ itemId: 'item-2', itemType: 'policy_proof', sourceModule: 'domain_policy_pack_runtime', sourceId: 'source-2', payloadHash: 'payload-hash-2' }],
    };
    assert.notEqual(hashService.hashManifest(input), hashService.hashManifest(changed));
  });

  it('10. hashManifest changes when referenceHashes changes', () => {
    const hashService = new ExportPackageHashService();
    const input = baseManifestInput();
    const changed: HashManifestInput = { ...input, referenceHashes: [{ referenceId: 'reference-2', referenceHash: 'reference-hash-2' }] };
    assert.notEqual(hashService.hashManifest(input), hashService.hashManifest(changed));
  });

  it('11. hashPackage is deterministic and changes when manifestHash changes', () => {
    const hashService = new ExportPackageHashService();
    const base = {
      id: 'package-1',
      type: 'decision_packet',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      packageVersion: '1',
      manifestHash: 'manifest-hash-1',
    };
    assert.equal(hashService.hashPackage(base), hashService.hashPackage({ ...base }));
    assert.notEqual(hashService.hashPackage(base), hashService.hashPackage({ ...base, manifestHash: 'manifest-hash-2' }));
  });

  it('12. hashPackage changes when previousPackageHash changes', () => {
    const hashService = new ExportPackageHashService();
    const base = {
      id: 'package-1',
      type: 'decision_packet',
      trustDomainId: 'trust-domain-1',
      targetType: 'enforcement_decision',
      targetId: 'target-1',
      packageVersion: '1',
      manifestHash: 'manifest-hash-1',
    };
    const withoutPrevious = hashService.hashPackage(base);
    const withPrevious = hashService.hashPackage({ ...base, previousPackageHash: 'previous-hash-1' });
    const withDifferentPrevious = hashService.hashPackage({ ...base, previousPackageHash: 'previous-hash-2' });
    assert.notEqual(withoutPrevious, withPrevious);
    assert.notEqual(withPrevious, withDifferentPrevious);
  });

  it('13. hashSerializedArtifact is deterministic over a string', () => {
    const hashService = new ExportPackageHashService();
    const content = JSON.stringify({ hello: 'world' });
    assert.equal(hashService.hashSerializedArtifact(content), hashService.hashSerializedArtifact(content));
    assert.notEqual(hashService.hashSerializedArtifact(content), hashService.hashSerializedArtifact(content + ' '));
  });

  it('14. hashAuditBundle is deterministic', () => {
    const hashService = new ExportPackageHashService();
    const input = {
      scope: { trustDomainId: 'trust-domain-1', actorIds: [], actionIds: [], decisionIds: [], proofIds: [] },
      packageIds: ['package-1'],
      summary: { packageCount: 1, decisionCount: 0, proofCount: 0, eventCount: 0, issueCount: 0 },
    };
    assert.equal(hashService.hashAuditBundle(input), hashService.hashAuditBundle({ ...input }));
    assert.notEqual(hashService.hashAuditBundle(input), hashService.hashAuditBundle({ ...input, packageIds: ['package-2'] }));
  });

  it('15. changing an item payload changes the section hash it belongs to', () => {
    const hashService = new ExportPackageHashService();
    const original = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1', { allowed: true });
    const mutatedPayload = { allowed: false };
    const mutated = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1', mutatedPayload);
    const originalSectionHash = hashService.hashSection({ type: 'policy', required: true, items: [original] });
    const mutatedSectionHash = hashService.hashSection({ type: 'policy', required: true, items: [mutated] });
    assert.notEqual(original.payloadHash, mutated.payloadHash);
    assert.notEqual(originalSectionHash, mutatedSectionHash);
  });

  it('16. changing a section hash changes the resulting manifest hash', () => {
    const hashService = new ExportPackageHashService();
    const item = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1', { allowed: true });
    const mutatedItem = makeItem('item-1', 'policy_decision', 'domain_policy_pack_runtime', 'source-1', { allowed: false });
    const sectionHash = hashService.hashSection({ type: 'policy', required: true, items: [item] });
    const mutatedSectionHash = hashService.hashSection({ type: 'policy', required: true, items: [mutatedItem] });

    const manifestInput = baseManifestInput();
    const withOriginalSection: HashManifestInput = { ...manifestInput, sectionHashes: [{ sectionId: 'section-1', sectionType: 'policy', sectionHash }] };
    const withMutatedSection: HashManifestInput = { ...manifestInput, sectionHashes: [{ sectionId: 'section-1', sectionType: 'policy', sectionHash: mutatedSectionHash }] };

    assert.notEqual(sectionHash, mutatedSectionHash);
    assert.notEqual(hashService.hashManifest(withOriginalSection), hashService.hashManifest(withMutatedSection));
  });
});
