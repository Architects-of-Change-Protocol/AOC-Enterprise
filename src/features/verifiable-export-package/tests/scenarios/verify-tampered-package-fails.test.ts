import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExportPackage } from '../../domain/export-package.js';
import { buildVerifiableExportDemoFixture } from '../../fixtures/verifiable-export-demo.fixture.js';

/**
 * Deep-clones a package and mutates one item's payload in place, leaving its
 * (now stale) payloadHash untouched -- simulating a package whose stored
 * item was tampered with after it was sealed and verified.
 */
function tamperFirstEnforcementDecisionPayload(pkg: ExportPackage): ExportPackage {
  const cloned = JSON.parse(JSON.stringify(pkg)) as ExportPackage;
  const sections = cloned.sections.map((section) => {
    if (section.type !== 'enforcement') return section;
    const items = section.items.map((item) => {
      if (item.type !== 'enforcement_decision') return item;
      return { ...item, payload: { ...item.payload, reason: 'TAMPERED: this text was never produced by Action Enforcement.' } };
    });
    return { ...section, items };
  });
  return { ...cloned, sections };
}

describe('export scenario: verifying a tampered package fails', () => {
  it('1. verification status becomes failed after an item payload is tampered with post-seal', () => {
    const { runtime, packageId } = buildVerifiableExportDemoFixture();

    const original = runtime.getPackage(packageId);
    assert.ok(original !== undefined);
    const tampered = tamperFirstEnforcementDecisionPayload(original!);
    runtime.store.savePackage(tampered);

    const verification = runtime.verifyPackage(packageId);
    assert.equal(verification.status, 'failed');
  });

  it('2. at least one issue is reported with critical or error severity', () => {
    const { runtime, packageId } = buildVerifiableExportDemoFixture();

    const original = runtime.getPackage(packageId);
    const tampered = tamperFirstEnforcementDecisionPayload(original!);
    runtime.store.savePackage(tampered);

    const verification = runtime.verifyPackage(packageId);
    assert.ok(verification.issues.some((issue) => issue.severity === 'critical' || issue.severity === 'error'));
  });

  it('3. the issue set includes a hash-mismatch reasonCode', () => {
    const { runtime, packageId } = buildVerifiableExportDemoFixture();

    const original = runtime.getPackage(packageId);
    const tampered = tamperFirstEnforcementDecisionPayload(original!);
    runtime.store.savePackage(tampered);

    const verification = runtime.verifyPackage(packageId);
    assert.ok(verification.issues.some((issue) => issue.reasonCode.includes('HASH_MISMATCH')));
  });

  it('4. verifiedItemHashes is false on the failed verification', () => {
    const { runtime, packageId } = buildVerifiableExportDemoFixture();

    const original = runtime.getPackage(packageId);
    const tampered = tamperFirstEnforcementDecisionPayload(original!);
    runtime.store.savePackage(tampered);

    const verification = runtime.verifyPackage(packageId);
    assert.equal(verification.verifiedItemHashes, false);
  });
});
