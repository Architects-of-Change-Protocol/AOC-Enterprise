import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { composeJurisdictionWithBaseline } from '../../../jurisdiction-pack-composer.js';
import { buildCostaRicaDemoBaselinePackFixture } from '../costa-rica-fixtures.js';
import { buildGlobalBaselineManifestFixture } from '../../../../../policy-pack-foundation/fixtures/policy-pack-foundation-fixtures.js';
import { COSTA_RICA_BASE_PACK_ID, COSTA_RICA_REQUIRED_BASELINE_PACK_ID } from '../costa-rica-constants.js';

describe('Costa Rica Base Pack composes through Policy Pack Foundation', () => {
  it('16. composes with the global legal baseline when it is available', () => {
    const costaRicaPack = buildCostaRicaDemoBaselinePackFixture();
    const baseline = buildGlobalBaselineManifestFixture();

    const composition = composeJurisdictionWithBaseline({
      compositionId: 'costa-rica-composition-16',
      jurisdictionPack: costaRicaPack,
      baselinePackId: COSTA_RICA_REQUIRED_BASELINE_PACK_ID,
      availableManifests: [baseline],
    });

    assert.equal(composition.composed, true);
    assert.ok(composition.includedPackIds.includes(COSTA_RICA_BASE_PACK_ID));
    assert.ok(composition.includedPackIds.includes(COSTA_RICA_REQUIRED_BASELINE_PACK_ID));
    assert.equal(composition.safeFraming.notLegalAdvice, true);
    assert.equal(composition.safeFraming.noJurisdictionalComplianceClaim, true);
    assert.ok(composition.dependencyGraph.some((edge) => edge.toPackId === COSTA_RICA_REQUIRED_BASELINE_PACK_ID && edge.satisfied));
  });

  it('17. a missing global legal baseline blocks composition', () => {
    const costaRicaPack = buildCostaRicaDemoBaselinePackFixture();

    const composition = composeJurisdictionWithBaseline({
      compositionId: 'costa-rica-composition-17',
      jurisdictionPack: costaRicaPack,
      baselinePackId: COSTA_RICA_REQUIRED_BASELINE_PACK_ID,
      availableManifests: [],
    });

    assert.equal(composition.composed, false);
    assert.ok(composition.missingPackIds.includes(COSTA_RICA_REQUIRED_BASELINE_PACK_ID));
    assert.ok(['hold', 'require_review'].includes(composition.decision));
  });

  it('a disabled global legal baseline denies composition', () => {
    const costaRicaPack = buildCostaRicaDemoBaselinePackFixture();
    const disabledBaseline = { ...buildGlobalBaselineManifestFixture(), status: 'disabled' as const };

    const composition = composeJurisdictionWithBaseline({
      compositionId: 'costa-rica-composition-disabled',
      jurisdictionPack: costaRicaPack,
      baselinePackId: COSTA_RICA_REQUIRED_BASELINE_PACK_ID,
      availableManifests: [disabledBaseline],
    });

    assert.equal(composition.composed, false);
    assert.equal(composition.decision, 'deny');
  });
});
