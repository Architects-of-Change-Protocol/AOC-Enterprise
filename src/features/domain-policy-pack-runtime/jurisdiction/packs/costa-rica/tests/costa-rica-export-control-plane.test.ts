import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { composeJurisdictionWithBaseline } from '../../../jurisdiction-pack-composer.js';
import { detectFoundationRuntimeCapabilities } from '../../../../../policy-pack-foundation/foundation/foundation-runtime-capabilities.js';
import { assertNoPolicyPackOverclaim } from '../../../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { buildGlobalBaselineManifestFixture } from '../../../../../policy-pack-foundation/fixtures/policy-pack-foundation-fixtures.js';
import { buildCostaRicaDemoBaselinePackFixture } from '../costa-rica-fixtures.js';
import { COSTA_RICA_REQUIRED_BASELINE_PACK_ID } from '../costa-rica-constants.js';
import { createCostaRicaExportMetadata } from '../costa-rica-export-requirements.js';
import { COSTA_RICA_CONTROL_PLANE_SAFE_LABELS, createCostaRicaControlPlaneSummary } from '../costa-rica-control-plane.js';

const UNSAFE_LABELS = ['Costa Rica compliant', 'CR compliant', 'Legally compliant', 'Fully legal', 'Regulatory approved', 'Certified compliant'];

function buildComposition() {
  const costaRicaPack = buildCostaRicaDemoBaselinePackFixture();
  const baseline = buildGlobalBaselineManifestFixture();
  return composeJurisdictionWithBaseline({
    compositionId: 'costa-rica-export-control-plane',
    jurisdictionPack: costaRicaPack,
    baselinePackId: COSTA_RICA_REQUIRED_BASELINE_PACK_ID,
    availableManifests: [baseline],
  });
}

describe('Costa Rica Base Pack export metadata and Control Plane summary', () => {
  it('20. creates export metadata safely', () => {
    const composition = buildComposition();
    const capabilities = detectFoundationRuntimeCapabilities();

    const metadata = createCostaRicaExportMetadata({ exportId: 'costa-rica-export-20', composition, capabilities });

    assert.equal(metadata.rootPackId, composition.rootPackId);
    assert.equal(metadata.safeFraming.notLegalAdvice, true);
    assert.equal(metadata.safeFraming.noJurisdictionalComplianceClaim, true);
    assertNoPolicyPackOverclaim(metadata);
    for (const unsafeLabel of UNSAFE_LABELS) {
      assert.ok(!JSON.stringify(metadata).includes(unsafeLabel));
    }
  });

  it('21. creates a Control Plane summary with safe labels only', () => {
    const composition = buildComposition();
    const capabilities = detectFoundationRuntimeCapabilities();

    const summary = createCostaRicaControlPlaneSummary({ composition, capabilities });

    for (const safeLabel of COSTA_RICA_CONTROL_PLANE_SAFE_LABELS) {
      assert.ok(summary.displaySafeLabels.includes(safeLabel), `expected safe label "${safeLabel}"`);
    }
    for (const unsafeLabel of UNSAFE_LABELS) {
      assert.ok(!summary.displaySafeLabels.includes(unsafeLabel), `must not include "${unsafeLabel}"`);
    }
    assertNoPolicyPackOverclaim(summary);
  });
});
