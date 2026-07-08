import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiableExportDemoFixture, ENFORCEMENT_DECISION_ID } from '../../../verifiable-export-package/fixtures/verifiable-export-demo.fixture.js';
import { checkExportPackageBinding, exportPackageBindingIsSatisfied } from '../../integrations/verifiable-export-pilot-adapter.js';
import { buildMinimalExportPackageDefinition } from '../../fixtures/minimal-pilot-template.fixture.js';

describe('verifiable-export-pilot-adapter', () => {
  it('1. maps export package', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const pkg = fixture.runtime.getPackage(fixture.packageId);
    if (pkg === undefined) {
      throw new Error('Expected package.');
    }
    const manifest = fixture.runtime.getPackageManifest(fixture.packageId);
    const verification = fixture.runtime.getPackageVerification(fixture.packageId);
    const definition = buildMinimalExportPackageDefinition({ packageType: 'decision_packet', targetId: ENFORCEMENT_DECISION_ID, expectedSections: ['summary', 'enforcement'], expectedVerificationStatus: 'verified' });
    const check = checkExportPackageBinding(definition, pkg, manifest, verification);
    assert.equal(check.matchesType, true);
  });

  it('2. validates package type', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const pkg = fixture.runtime.getPackage(fixture.packageId);
    if (pkg === undefined) {
      throw new Error('Expected package.');
    }
    const definition = buildMinimalExportPackageDefinition({ packageType: 'evidence_packet' });
    const check = checkExportPackageBinding(definition, pkg, undefined, undefined);
    assert.equal(check.matchesType, false);
  });

  it('3. validates verification status', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const pkg = fixture.runtime.getPackage(fixture.packageId);
    const verification = fixture.runtime.getPackageVerification(fixture.packageId);
    if (pkg === undefined) {
      throw new Error('Expected package.');
    }
    const definition = buildMinimalExportPackageDefinition({ packageType: 'decision_packet', targetId: ENFORCEMENT_DECISION_ID, expectedSections: ['summary', 'enforcement'], expectedVerificationStatus: 'verified' });
    const check = checkExportPackageBinding(definition, pkg, fixture.runtime.getPackageManifest(fixture.packageId), verification);
    assert.equal(check.verificationStatus, 'verified');
    assert.equal(check.meetsExpectedVerification, true);
  });

  it('4. validates package hash', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const pkg = fixture.runtime.getPackage(fixture.packageId);
    if (pkg === undefined) {
      throw new Error('Expected package.');
    }
    const definition = buildMinimalExportPackageDefinition();
    const check = checkExportPackageBinding(definition, pkg, undefined, undefined);
    assert.equal(check.hasHash, true);
  });

  it('5. validates sections', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const pkg = fixture.runtime.getPackage(fixture.packageId);
    if (pkg === undefined) {
      throw new Error('Expected package.');
    }
    const definition = buildMinimalExportPackageDefinition({ expectedSections: ['summary', 'enforcement', 'evidence'] });
    const check = checkExportPackageBinding(definition, pkg, undefined, undefined);
    assert.deepEqual(check.missingSections, ['evidence']);
  });

  it('6. does not fake package', () => {
    const fixture = buildVerifiableExportDemoFixture();
    const pkg = fixture.runtime.getPackage(fixture.packageId);
    if (pkg === undefined) {
      throw new Error('Expected package.');
    }
    const definition = buildMinimalExportPackageDefinition({ packageType: 'decision_packet', targetId: ENFORCEMENT_DECISION_ID, expectedSections: ['summary', 'enforcement'], expectedVerificationStatus: 'verified' });
    const check = checkExportPackageBinding(definition, pkg, undefined, undefined);
    assert.equal(check.hasManifest, false);
    assert.equal(exportPackageBindingIsSatisfied(check), false);
  });
});
