import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { composeJurisdictionWithBaseline } from '../jurisdiction-pack-composer.js';
import { buildDemoJurisdictionPackFixture } from '../jurisdiction-pack-fixtures.js';
import {
  buildDisabledManifestFixture,
  buildGlobalBaselineManifestFixture,
} from '../../../policy-pack-foundation/fixtures/policy-pack-foundation-fixtures.js';

describe('Jurisdiction Pack Runtime composition uses composePolicyPacks', () => {
  it('7. composes a jurisdiction pack with an available baseline pack', () => {
    const jurisdictionPack = buildDemoJurisdictionPackFixture();
    const baseline = buildGlobalBaselineManifestFixture();

    const composition = composeJurisdictionWithBaseline({
      compositionId: 'test-composition-7',
      jurisdictionPack,
      baselinePackId: baseline.id,
      availableManifests: [baseline],
    });

    assert.equal(composition.composed, true);
    assert.ok(composition.includedPackIds.includes(jurisdictionPack.manifest.id));
    assert.ok(composition.includedPackIds.includes(baseline.id));
    assert.ok(composition.dependencyGraph.some((edge) => edge.toPackId === baseline.id && edge.satisfied));
    assert.equal(composition.safeFraming.notLegalAdvice, true);
    assert.equal(composition.safeFraming.noJurisdictionalComplianceClaim, true);
  });

  it('8. a missing required baseline blocks jurisdiction composition', () => {
    const jurisdictionPack = buildDemoJurisdictionPackFixture();

    const composition = composeJurisdictionWithBaseline({
      compositionId: 'test-composition-8',
      jurisdictionPack,
      baselinePackId: 'aoc.global_legal_baseline.v1',
      availableManifests: [],
    });

    assert.equal(composition.composed, false);
    assert.ok(composition.missingPackIds.includes('aoc.global_legal_baseline.v1'));
    assert.ok(['hold', 'require_review'].includes(composition.decision));
  });

  it('9. a disabled baseline denies jurisdiction composition', () => {
    const jurisdictionPack = buildDemoJurisdictionPackFixture();
    const disabledBaseline = { ...buildDisabledManifestFixture(), id: 'aoc.global_legal_baseline.v1' };

    const composition = composeJurisdictionWithBaseline({
      compositionId: 'test-composition-9',
      jurisdictionPack,
      baselinePackId: disabledBaseline.id,
      availableManifests: [disabledBaseline],
    });

    assert.equal(composition.composed, false);
    assert.ok(composition.disabledPackIds.includes(disabledBaseline.id));
    assert.equal(composition.decision, 'deny');
  });

  it('a stale duplicate of the jurisdiction pack manifest in availableManifests never shadows the explicit pack', () => {
    const jurisdictionPack = buildDemoJurisdictionPackFixture();
    const baseline = buildGlobalBaselineManifestFixture();
    // Simulate a caller passing a full registry dump that happens to also contain a stale,
    // disabled copy of this same jurisdiction pack id -- composeJurisdictionWithBaseline
    // must still use the explicit, valid jurisdictionPack.manifest as the composition root.
    const staleDuplicate = { ...jurisdictionPack.manifest, status: 'disabled' as const };

    const composition = composeJurisdictionWithBaseline({
      compositionId: 'test-composition-stale-duplicate',
      jurisdictionPack,
      baselinePackId: baseline.id,
      availableManifests: [staleDuplicate, baseline],
    });

    assert.equal(composition.composed, true);
    assert.equal(composition.disabledPackIds.length, 0);
    assert.notEqual(composition.decision, 'deny');
  });
});
