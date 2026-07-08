import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiableExportDemoFixture, ENFORCEMENT_DECISION_ID } from '../../verifiable-export-package/fixtures/verifiable-export-demo.fixture.js';
import { createExportRuntimeContext } from '../../verifiable-export-package/domain/export-runtime-context.js';
import { createExportPackageRuntime } from '../../verifiable-export-package/services/export-package-runtime.js';
import { buildSummaryTextItem } from '../../verifiable-export-package/services/export-package-section-builder.js';
import { PilotExportPackageBindingService } from '../services/pilot-export-package-binding-service.js';
import { buildMinimalExportPackageDefinition } from '../fixtures/minimal-pilot-template.fixture.js';

describe('PilotExportPackageBindingService', () => {
  it('1. binds export package definition to real package', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const service = new PilotExportPackageBindingService({ runtime: fixture.runtime });
    const definition = buildMinimalExportPackageDefinition({ packageType: 'decision_packet', targetId: ENFORCEMENT_DECISION_ID, expectedSections: ['summary', 'enforcement'], expectedVerificationStatus: 'verified' });
    const result = service.bindOne(definition, fixture.packageId);
    assert.equal(result.bound, true);
    assert.equal(result.status, 'bound');
  });

  it('2. validates package type', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const service = new PilotExportPackageBindingService({ runtime: fixture.runtime });
    const definition = buildMinimalExportPackageDefinition({ packageType: 'evidence_packet' });
    const result = service.bindOne(definition, fixture.packageId);
    assert.equal(result.check?.matchesType, false);
    assert.equal(result.bound, false);
  });

  it('3. validates target type', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const service = new PilotExportPackageBindingService({ runtime: fixture.runtime });
    const definition = buildMinimalExportPackageDefinition({ packageType: 'decision_packet', targetType: 'policy_decision', targetId: ENFORCEMENT_DECISION_ID });
    const result = service.bindOne(definition, fixture.packageId);
    assert.equal(result.check?.matchesTarget, false);
  });

  it('4. validates target ID', () => {
    // The real package's own targetId is what is checked (a static
    // PilotExportPackageDefinition.targetId is a documentation label, not a
    // knowable-in-advance runtime id) -- so a package whose real targetId is
    // genuinely empty must fail, regardless of the definition's own label.
    const exportCtx = createExportRuntimeContext('2026-01-01T00:00:00.000Z');
    const runtime = createExportPackageRuntime(exportCtx);
    const { pkg } = runtime.createDecisionPacket({
      title: 'Package with empty target id',
      description: 'd',
      trustDomainId: 'trust-domain-test',
      targetType: 'enforcement_decision',
      targetId: '',
      sections: [
        { type: 'summary', required: true, items: [buildSummaryTextItem(exportCtx, 's')] },
        { type: 'enforcement', required: true, items: [buildSummaryTextItem(exportCtx, 'e')] },
      ],
    });
    const service = new PilotExportPackageBindingService({ runtime });
    const definition = buildMinimalExportPackageDefinition({ packageType: 'decision_packet', targetType: 'enforcement_decision' });
    const result = service.bindOne(definition, pkg.id);
    assert.equal(result.check?.matchesTarget, false);
  });

  it('5. validates expected sections', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const service = new PilotExportPackageBindingService({ runtime: fixture.runtime });
    const definition = buildMinimalExportPackageDefinition({ packageType: 'decision_packet', targetId: ENFORCEMENT_DECISION_ID, expectedSections: ['summary', 'enforcement', 'evidence'] });
    const result = service.bindOne(definition, fixture.packageId);
    assert.deepEqual(result.check?.missingSections, ['evidence']);
    assert.equal(result.bound, false);
  });

  it('6. validates verification status', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const service = new PilotExportPackageBindingService({ runtime: fixture.runtime });
    const definition = buildMinimalExportPackageDefinition({ packageType: 'decision_packet', targetId: ENFORCEMENT_DECISION_ID, expectedSections: ['summary', 'enforcement'], expectedVerificationStatus: 'failed' });
    const result = service.bindOne(definition, fixture.packageId);
    assert.equal(result.check?.meetsExpectedVerification, false);
  });

  it('7. reports missing package', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const service = new PilotExportPackageBindingService({ runtime: fixture.runtime });
    const definition = buildMinimalExportPackageDefinition();
    const result = service.bindOne(definition, 'not-a-real-package');
    assert.equal(result.status, 'missing_package');
    assert.equal(result.bound, false);
  });

  it('8. reports failed verification', () => {
    const exportCtx = createExportRuntimeContext('2026-01-01T00:00:00.000Z');
    const runtime = createExportPackageRuntime(exportCtx);
    // Deliberately omit the required 'enforcement' section for a decision_packet so verification fails.
    const { pkg } = runtime.createDecisionPacket({
      title: 'Incomplete packet',
      description: 'Missing its required enforcement section.',
      trustDomainId: 'trust-domain-test',
      targetType: 'enforcement_decision',
      targetId: 'enforcement-decision-incomplete',
      sections: [{ type: 'summary', required: true, items: [buildSummaryTextItem(exportCtx, 'summary only')] }],
    });
    runtime.sealPackage(pkg.id);
    runtime.verifyPackage(pkg.id);
    assert.equal(runtime.getPackageVerification(pkg.id)?.status, 'failed');

    const service = new PilotExportPackageBindingService({ runtime });
    const definition = buildMinimalExportPackageDefinition({ packageType: 'decision_packet', targetId: 'enforcement-decision-incomplete', expectedSections: ['summary'], expectedVerificationStatus: 'verified' });
    const result = service.bindOne(definition, pkg.id);
    assert.equal(result.status, 'failed_verification');
    assert.equal(result.bound, false);
  });

  it('9. does not fake package (no runtime supplied)', () => {
    const service = new PilotExportPackageBindingService();
    const definition = buildMinimalExportPackageDefinition();
    const result = service.bindOne(definition, 'any-id');
    assert.equal(result.status, 'missing_package');
    assert.equal(result.bound, false);
  });

  it('10. deterministic output', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const service = new PilotExportPackageBindingService({ runtime: fixture.runtime });
    const definition = buildMinimalExportPackageDefinition({ packageType: 'decision_packet', targetId: ENFORCEMENT_DECISION_ID, expectedSections: ['summary', 'enforcement'], expectedVerificationStatus: 'verified' });
    const first = service.bindOne(definition, fixture.packageId);
    const second = service.bindOne(definition, fixture.packageId);
    assert.deepEqual(first, second);
  });
});
