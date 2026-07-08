import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createJurisdictionPack, fromPolicyPackManifest, toPolicyPackManifest } from '../jurisdiction-pack-factory.js';
import { validateJurisdictionPack } from '../jurisdiction-pack-validator.js';
import { buildDemoJurisdictionPackFixture } from '../jurisdiction-pack-fixtures.js';
import { buildGlobalBaselineManifestFixture } from '../../../policy-pack-foundation/fixtures/policy-pack-foundation-fixtures.js';

describe('JurisdictionPack consumes PolicyPackManifest', () => {
  it('1. a created jurisdiction pack carries a PolicyPackManifest with jurisdiction-safe framing', () => {
    const pack = buildDemoJurisdictionPackFixture();

    assert.equal(pack.manifest.kind, 'jurisdiction_pack');
    assert.equal(pack.manifest.domain, 'jurisdiction');
    assert.equal(pack.manifest.scope.jurisdictionSpecific, true);
    assert.equal(pack.manifest.safeFraming.notLegalAdvice, true);
    assert.equal(pack.manifest.safeFraming.notComplianceCertification, true);
    assert.equal(pack.manifest.safeFraming.noJurisdictionalComplianceClaim, true);
    assert.equal(pack.manifest.safeFraming.partialPolicyModel, true);
  });

  it('toPolicyPackManifest returns the pack manifest directly (no second manifest standard)', () => {
    const pack = buildDemoJurisdictionPackFixture();
    assert.equal(toPolicyPackManifest(pack), pack.manifest);
  });

  it('fromPolicyPackManifest wraps an existing manifest without inventing requirements', () => {
    const manifest = buildGlobalBaselineManifestFixture();
    const pack = fromPolicyPackManifest(manifest, { jurisdictionId: 'demo-jurisdiction', label: 'Demo Jurisdiction' });

    assert.equal(pack.manifest, manifest);
    assert.deepEqual(pack.evidenceRequirements, manifest.evidenceRequirements);
    assert.deepEqual(pack.reviewRequirements, manifest.approvalRequirements);
  });

  it('validateJurisdictionPack delegates structural checks to validatePolicyPackManifest and adds jurisdiction-shape checks', () => {
    const pack = buildDemoJurisdictionPackFixture();
    const result = validateJurisdictionPack(pack);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('validateJurisdictionPack rejects a manifest that is not a jurisdiction_pack', () => {
    const nonJurisdictionManifest = buildGlobalBaselineManifestFixture();
    const pack = fromPolicyPackManifest(nonJurisdictionManifest, { jurisdictionId: 'demo-jurisdiction', label: 'Demo Jurisdiction' });
    const result = validateJurisdictionPack(pack);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('manifest.kind')));
  });

  it('validateJurisdictionPack rejects a pack with a blank jurisdiction id', () => {
    const pack = createJurisdictionPack({
      id: 'aoc.demo.blank_jurisdiction.v1',
      name: 'Demo Blank Jurisdiction Pack',
      version: '1.0.0',
      jurisdiction: { jurisdictionId: '  ', label: 'Blank' },
      status: 'demo_baseline',
      sourceStatus: 'demo_fixture',
      description: 'Demo fixture exercising the missing-jurisdictionId validation error.',
    });
    const result = validateJurisdictionPack(pack);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('jurisdictionId')));
  });
});
