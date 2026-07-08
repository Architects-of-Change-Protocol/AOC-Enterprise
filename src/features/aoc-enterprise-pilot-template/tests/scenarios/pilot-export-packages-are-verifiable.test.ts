import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFoundationV1CompleteFixture } from '../../fixtures/foundation-v1-complete.fixture.js';

describe('Pilot export packages are verifiable', () => {
  it('1. every pilot export package binding has package ID', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    for (const kit of fixture.kits) {
      assert.ok(kit.boundExportPackageIds.length > 0, `${kit.templateId} should have at least one bound export package`);
      for (const id of kit.boundExportPackageIds) {
        assert.ok(id.length > 0);
      }
    }
  });

  it('2. every package has packageHash', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    for (const [kit, exportRuntime] of [
      [fixture.datasys.kit, fixture.datasys.exportRuntime],
      [fixture.bank.kit, fixture.bank.exportRuntime],
      [fixture.healthcare.kit, fixture.healthcare.exportRuntime],
      [fixture.sports.kit, fixture.sports.exportRuntime],
    ] as const) {
      for (const packageId of kit.boundExportPackageIds) {
        const pkg = exportRuntime.getPackage(packageId);
        assert.ok(pkg?.packageHash !== undefined && pkg.packageHash.length > 0, `package ${packageId} should have a packageHash`);
      }
    }
  });

  it('3. every package has manifest', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    for (const [kit, exportRuntime] of [
      [fixture.datasys.kit, fixture.datasys.exportRuntime],
      [fixture.bank.kit, fixture.bank.exportRuntime],
      [fixture.healthcare.kit, fixture.healthcare.exportRuntime],
      [fixture.sports.kit, fixture.sports.exportRuntime],
    ] as const) {
      for (const packageId of kit.boundExportPackageIds) {
        assert.ok(exportRuntime.getPackageManifest(packageId) !== undefined, `package ${packageId} should have a manifest`);
      }
    }
  });

  it('4. every package verification status is verified or verified_with_warnings', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    for (const [kit, exportRuntime] of [
      [fixture.datasys.kit, fixture.datasys.exportRuntime],
      [fixture.bank.kit, fixture.bank.exportRuntime],
      [fixture.healthcare.kit, fixture.healthcare.exportRuntime],
      [fixture.sports.kit, fixture.sports.exportRuntime],
    ] as const) {
      for (const packageId of kit.boundExportPackageIds) {
        const verification = exportRuntime.getPackageVerification(packageId);
        assert.ok(verification !== undefined && ['verified', 'verified_with_warnings'].includes(verification.status), `package ${packageId} should be verified`);
      }
    }
  });

  it('5. no failed required package', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    for (const kit of fixture.kits) {
      assert.deepEqual(kit.readiness.failedExportPackageIds, []);
    }
  });
});
