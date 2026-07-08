import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { assertNoJurisdictionOverclaim, evaluateJurisdictionClaimSafety } from '../jurisdiction-pack-claim-safety.js';
import { assertNoPolicyPackOverclaim } from '../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { buildDemoJurisdictionPackFixture } from '../jurisdiction-pack-fixtures.js';
import { createJurisdictionExportMetadata } from '../jurisdiction-pack-export.js';
import { createJurisdictionControlPlaneSummary } from '../jurisdiction-pack-control-plane.js';
import { composeJurisdictionWithBaseline } from '../jurisdiction-pack-composer.js';
import { buildGlobalBaselineManifestFixture } from '../../../policy-pack-foundation/fixtures/policy-pack-foundation-fixtures.js';
import { detectFoundationRuntimeCapabilities } from '../../../policy-pack-foundation/foundation/foundation-runtime-capabilities.js';

describe('Jurisdiction Pack Runtime uses the universal no-overclaim harness', () => {
  it('6. assertNoPolicyPackOverclaim passes for jurisdiction resolution output, export metadata, and Control Plane summaries', () => {
    const capabilities = detectFoundationRuntimeCapabilities();
    const jurisdictionPack = buildDemoJurisdictionPackFixture();
    const baseline = buildGlobalBaselineManifestFixture();

    const composition = composeJurisdictionWithBaseline({
      compositionId: 'test-composition',
      jurisdictionPack,
      baselinePackId: baseline.id,
      availableManifests: [baseline],
    });
    // A thrown error here fails the test on its own -- no doesNotThrow wrapper needed.
    assertNoPolicyPackOverclaim(composition);

    const exportMetadata = createJurisdictionExportMetadata({ exportId: 'test-export', composition, capabilities });
    assertNoPolicyPackOverclaim(exportMetadata);

    const controlPlaneSummary = createJurisdictionControlPlaneSummary({ composition, capabilities });
    assertNoPolicyPackOverclaim(controlPlaneSummary);
  });

  it('assertNoJurisdictionOverclaim delegates to assertNoPolicyPackOverclaim (identical failure behavior)', () => {
    assertNoJurisdictionOverclaim({ note: 'not legal advice; partial policy model' });
    assert.throws(() => assertNoJurisdictionOverclaim({ note: 'This pack is legally compliant.' }));
    assert.throws(() => assertNoPolicyPackOverclaim({ note: 'This pack is legally compliant.' }));
  });

  it('evaluateJurisdictionClaimSafety delegates to evaluatePolicyPackClaimSafety', () => {
    const unsafe = evaluateJurisdictionClaimSafety('jurisdictionally compliant');
    assert.equal(unsafe.safe, false);
    assert.ok(unsafe.prohibitedPhrasesFound.includes('jurisdictionally compliant'));

    const safe = evaluateJurisdictionClaimSafety('not legal advice');
    assert.equal(safe.safe, true);
  });

  it('16. no duplicate prohibited overclaim scanner: this module defines no phrase list of its own', () => {
    const claimSafetyFile = readFileSync(resolve(process.cwd(), 'src/features/domain-policy-pack-runtime/jurisdiction/jurisdiction-pack-claim-safety.ts'), 'utf8');
    assert.ok(!/PROHIBITED_OVERCLAIM_PHRASES\s*[:=]/.test(claimSafetyFile), 'jurisdiction-pack-claim-safety.ts must not define its own prohibited-phrase list');
    assert.ok(claimSafetyFile.includes('assertNoPolicyPackOverclaim'), 'assertNoJurisdictionOverclaim must delegate to assertNoPolicyPackOverclaim');
  });
});
