import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildVerifiableExportDemoFixture, SAMPLE_ENFORCEMENT_DECISION } from '../../fixtures/verifiable-export-demo.fixture.js';

describe('export scenario: executed low-risk read decision packet', () => {
  it('1. the enforcement decision item shows allowedToExecute: true and type execute_allowed', () => {
    const { runtime, packageId } = buildVerifiableExportDemoFixture();
    const pkg = runtime.getPackage(packageId);
    const enforcementSection = pkg?.sections.find((section) => section.type === 'enforcement');
    const decisionItem = enforcementSection?.items.find((item) => item.sourceId === SAMPLE_ENFORCEMENT_DECISION.id);
    assert.equal(decisionItem?.payload['allowedToExecute'], true);
    assert.equal(decisionItem?.payload['type'], 'execute_allowed');
  });

  it('2. an execution_result item is present with executed: true', () => {
    const { runtime, packageId } = buildVerifiableExportDemoFixture();
    const pkg = runtime.getPackage(packageId);
    const executionSection = pkg?.sections.find((section) => section.type === 'execution');
    const executionItem = executionSection?.items.find((item) => item.type === 'execution_result');
    assert.ok(executionItem !== undefined);
    assert.equal(executionItem?.payload['executed'], true);
  });

  it('3. the derived decision packet summary reports executed: true', () => {
    const { runtime, packageId } = buildVerifiableExportDemoFixture();
    const decisionPacket = runtime.getDecisionPacket(packageId);
    assert.equal(decisionPacket?.decisionSummary.executed, true);
  });

  // The summary section carries a real summary_text item (see
  // buildSummaryTextItem in export-package-section-builder.ts), so the
  // required `summary` section is present. This fixture's enforcement
  // decision carries no unresolved upstream reference ids, so verification
  // reaches a clean `'verified'` with zero issues.
  it('4. verification passes cleanly, with every hash intact and zero issues', () => {
    const { runtime, packageId } = buildVerifiableExportDemoFixture();
    const verification = runtime.getPackageVerification(packageId);
    assert.equal(verification?.status, 'verified');
    assert.equal(verification?.verifiedManifest, true);
    assert.equal(verification?.verifiedPackageHash, true);
    assert.equal(verification?.verifiedSectionHashes, true);
    assert.equal(verification?.verifiedItemHashes, true);
    assert.equal(verification?.verifiedReferenceHashes, true);
    assert.deepEqual(verification?.issues, []);
  });
});
