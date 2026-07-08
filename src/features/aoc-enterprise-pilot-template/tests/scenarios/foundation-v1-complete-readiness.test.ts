import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFoundationV1CompleteFixture, REQUIRED_FOUNDATION_V1_MODULES } from '../../fixtures/foundation-v1-complete.fixture.js';

describe('Foundation v1 complete readiness', () => {
  it('1. builds all four pilot kits', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    assert.equal(fixture.kits.length, 4);
  });

  it('2. verifies all required Foundation v1 modules are listed', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    assert.deepEqual(fixture.foundationStatus.requiredModules, REQUIRED_FOUNDATION_V1_MODULES);
  });

  it('3. verifies no missing required modules', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    assert.deepEqual(fixture.foundationStatus.missingModules, []);
  });

  it('4. verifies pilot template IDs exist', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    assert.deepEqual(
      [...fixture.foundationStatus.pilotTemplateIds].sort(),
      ['bank-payments-procurement-data', 'datasys-project-governance', 'healthcare-operations-sensitive-data', 'sports-event-settlement'].sort(),
    );
  });

  it('5. verifies ready pilot kit IDs exist', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    assert.equal(fixture.foundationStatus.readyPilotKitIds.length, 4);
  });

  it('6. verifies export package IDs exist', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    assert.ok(fixture.foundationStatus.verifiedExportPackageIds.length > 0);
  });

  it('7. Foundation status is complete or complete_with_warnings', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    assert.ok(['complete', 'complete_with_warnings'].includes(fixture.foundationStatus.status));
  });

  it('8. no critical readiness issues', async () => {
    const fixture = await buildFoundationV1CompleteFixture();
    assert.equal(fixture.foundationStatus.issues.filter((i) => i.severity === 'critical').length, 0);
  });
});
