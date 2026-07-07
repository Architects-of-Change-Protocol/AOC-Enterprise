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

  it('4. verification status is verified', () => {
    const { runtime, packageId } = buildVerifiableExportDemoFixture();
    const verification = runtime.getPackageVerification(packageId);
    assert.equal(verification?.status, 'verified');
  });
});
