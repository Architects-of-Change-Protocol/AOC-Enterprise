import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildEvidenceBackedDecisionPacketFixture } from '../../fixtures/evidence-backed-decision-packet.fixture.js';

describe('export scenario: a complete, correctly-composed package passes verification', () => {
  it('1. the manifest exists and manifestService.verifyManifest confirms it is internally consistent', async () => {
    const { runtime, packageId } = await buildEvidenceBackedDecisionPacketFixture();
    const manifest = runtime.getPackageManifest(packageId);
    assert.ok(manifest !== undefined);
    assert.equal(runtime.manifestService.verifyManifest(manifest!), true);
  });

  it('2. packageHash is present and matches hashService.recomputePackageHash', async () => {
    const { runtime, packageId } = await buildEvidenceBackedDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    const manifest = runtime.getPackageManifest(packageId);
    assert.ok(pkg?.packageHash !== undefined);
    assert.equal(runtime.hashService.recomputePackageHash(pkg!, manifest!.manifestHash), pkg?.packageHash);
  });

  it('3. every section sectionHash matches a fresh hashService.hashSection recomputation', async () => {
    const { runtime, packageId } = await buildEvidenceBackedDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    for (const section of pkg!.sections) {
      const recomputed = runtime.hashService.hashSection({ type: section.type, required: section.required, items: section.items });
      assert.equal(recomputed, section.sectionHash, `section ${section.type} hash should match`);
    }
  });

  it('4. every item payloadHash matches a fresh hashService.hashPayload recomputation', async () => {
    const { runtime, packageId } = await buildEvidenceBackedDecisionPacketFixture();
    const pkg = runtime.getPackage(packageId);
    for (const section of pkg!.sections) {
      for (const item of section.items) {
        assert.equal(runtime.hashService.hashPayload(item.payload), item.payloadHash, `item ${item.id} (${item.type}) hash should match`);
      }
    }
  });

  // MISSING_REFERENCE issues (warning severity, e.g. for upstream ids like
  // authorityProofId/recognitionDecisionId that this packet's enforcement
  // section references but does not itself include) can keep this from
  // reaching a clean `'verified'`, but must never produce a critical issue,
  // and must never reach `'failed'` -- every hash the package claims is
  // still internally consistent (see assertions 1-4 above).
  it('5. verification is not failed and carries zero critical-severity issues', async () => {
    const { runtime, packageId } = await buildEvidenceBackedDecisionPacketFixture();
    const verification = runtime.getPackageVerification(packageId);
    assert.notEqual(verification?.status, 'failed');
    const criticalIssues = verification?.issues.filter((issue) => issue.severity === 'critical') ?? [];
    assert.equal(criticalIssues.length, 0);
  });
});
