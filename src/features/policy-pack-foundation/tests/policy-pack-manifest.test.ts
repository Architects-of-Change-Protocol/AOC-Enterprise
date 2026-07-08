import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPolicyPackManifest } from '../manifest/policy-pack-manifest-factory.js';

describe('createPolicyPackManifest', () => {
  it('6. defaults system-authored/demo packs to safe framing', () => {
    const manifest = createPolicyPackManifest({
      id: ' aoc.demo.example.v1 ',
      name: ' Demo Example ',
      version: ' 1.0.0 ',
      kind: 'demo_pack',
      domain: 'legal',
      status: 'demo_baseline',
      sourceStatus: 'demo_fixture',
      description: 'A demo fixture pack.',
    });

    assert.equal(manifest.safeFraming.notLegalAdvice, true);
    assert.equal(manifest.safeFraming.notComplianceCertification, true);
    assert.equal(manifest.safeFraming.noCompletenessClaim, true);
    assert.equal(manifest.safeFraming.noJurisdictionalComplianceClaim, true);
    assert.equal(manifest.safeFraming.partialPolicyModel, true);
  });

  it('trims identity fields and normalizes dependency/label arrays', () => {
    const manifest = createPolicyPackManifest({
      id: ' aoc.demo.example.v1 ',
      name: ' Demo Example ',
      version: ' 1.0.0 ',
      kind: 'demo_pack',
      domain: 'legal',
      status: 'demo_baseline',
      sourceStatus: 'demo_fixture',
      description: ' A demo fixture pack. ',
      requiredPackIds: ['a', 'a', 'b'],
      labels: ['custom_label'],
    });

    assert.equal(manifest.id, 'aoc.demo.example.v1');
    assert.equal(manifest.name, 'Demo Example');
    assert.equal(manifest.version, '1.0.0');
    assert.equal(manifest.description, 'A demo fixture pack.');
    assert.deepEqual(manifest.requiredPackIds, ['a', 'b']);
    assert.ok(manifest.labels.includes('custom_label'));
    assert.ok(manifest.labels.includes('not_legal_advice'));
  });

  it('a system-authored pack cannot opt out of safe framing even if the caller tries', () => {
    const manifest = createPolicyPackManifest({
      id: 'aoc.demo.attempted_overclaim.v1',
      name: 'Attempted Overclaim',
      version: '1.0.0',
      kind: 'system_pack',
      domain: 'legal',
      status: 'system_baseline',
      sourceStatus: 'system_authored',
      description: 'A system pack that tries to disable safe framing.',
      safeFraming: { notLegalAdvice: false, notComplianceCertification: false, noCompletenessClaim: false, noJurisdictionalComplianceClaim: false, partialPolicyModel: false },
    });

    assert.equal(manifest.safeFraming.notLegalAdvice, true);
    assert.equal(manifest.safeFraming.notComplianceCertification, true);
  });

  it('a customer pack is not forced into system-authored safe framing overrides but still defaults safely', () => {
    const manifest = createPolicyPackManifest({
      id: 'customer.pack.v1',
      name: 'Customer Pack',
      version: '1.0.0',
      kind: 'customer_pack',
      domain: 'general',
      status: 'customer_provided',
      sourceStatus: 'customer_provided',
      description: 'A customer-provided pack.',
    });

    assert.equal(manifest.safeFraming.notLegalAdvice, true);
    assert.equal(manifest.scope.customerSpecific, true);
  });

  it('defaults evidence/approval/export/control-plane requirement arrays to empty', () => {
    const manifest = createPolicyPackManifest({
      id: 'aoc.demo.empty.v1',
      name: 'Empty',
      version: '1.0.0',
      kind: 'demo_pack',
      domain: 'general',
      status: 'demo_baseline',
      sourceStatus: 'demo_fixture',
      description: 'Empty requirements demo pack.',
    });

    assert.deepEqual(manifest.evidenceRequirements, []);
    assert.deepEqual(manifest.approvalRequirements, []);
    assert.deepEqual(manifest.exportRequirements, []);
    assert.deepEqual(manifest.controlPlaneRequirements, []);
  });
});
