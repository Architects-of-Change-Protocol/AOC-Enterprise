import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { composeJurisdictionWithBaseline } from '../../../jurisdiction-pack-composer.js';
import { createJurisdictionPackRegistry } from '../../../jurisdiction-pack-registry.js';
import { buildCostaRicaDemoBaselinePackFixture } from '../costa-rica-fixtures.js';
import { buildGlobalBaselineManifestFixture } from '../../../../../policy-pack-foundation/fixtures/policy-pack-foundation-fixtures.js';
import { COSTA_RICA_BASE_PACK_ID, COSTA_RICA_JURISDICTION_COUNTRY_CODE, COSTA_RICA_REQUIRED_BASELINE_PACK_ID } from '../costa-rica-constants.js';
import { findCostaRicaJurisdictionPacks, findJurisdictionPacksByCountryCode } from '../costa-rica-registry.js';
import { evaluateCostaRicaReviewTriggers } from '../costa-rica-review-triggers.js';

function buildComposition() {
  const costaRicaPack = buildCostaRicaDemoBaselinePackFixture();
  const baseline = buildGlobalBaselineManifestFixture();
  return composeJurisdictionWithBaseline({
    compositionId: 'costa-rica-evidence-approval',
    jurisdictionPack: costaRicaPack,
    baselinePackId: COSTA_RICA_REQUIRED_BASELINE_PACK_ID,
    availableManifests: [baseline],
  });
}

describe('Costa Rica Base Pack evidence, approval, and registry integration', () => {
  it('18. aggregates Costa Rica evidence requirements through composition', () => {
    const composition = buildComposition();
    const evidenceTypes = composition.requiredEvidence.map((requirement) => requirement.evidenceType);

    assert.ok(evidenceTypes.includes('jurisdiction_basis_source'));
    assert.ok(evidenceTypes.includes('customer_validation_record'));
    assert.ok(evidenceTypes.includes('counsel_review_record'));
  });

  it('19. aggregates Costa Rica approval requirements through composition', () => {
    const composition = buildComposition();
    const reviewTypes = composition.requiredApprovals.map((requirement) => requirement.reviewType);

    assert.ok(reviewTypes.includes('customer_validation'));
    assert.ok(reviewTypes.includes('counsel_review'));
  });

  it('review triggers recommend the corresponding evidence/approval types', () => {
    const fired = evaluateCostaRicaReviewTriggers({ minor_or_age_sensitive_participant: true, payment_flow_touching_costa_rica: true });

    assert.equal(fired.length, 2);
    assert.ok(fired.some((trigger) => trigger.requiredApprovalTypes.includes('counsel_review')));
    assert.ok(fired.some((trigger) => trigger.requiredEvidenceTypes.includes('payment_flow_description')));
  });

  it('7. the registry finds the Costa Rica pack by jurisdictionId and by countryCode CR', () => {
    const registry = createJurisdictionPackRegistry([buildCostaRicaDemoBaselinePackFixture()]);

    const byJurisdictionId = findCostaRicaJurisdictionPacks(registry);
    assert.ok(byJurisdictionId.some((pack) => pack.manifest.id === COSTA_RICA_BASE_PACK_ID));

    const byCountryCode = findJurisdictionPacksByCountryCode(registry, COSTA_RICA_JURISDICTION_COUNTRY_CODE);
    assert.ok(byCountryCode.some((pack) => pack.manifest.id === COSTA_RICA_BASE_PACK_ID));
  });

  it('8. the registry does not return the Costa Rica pack for unrelated jurisdictions', () => {
    const registry = createJurisdictionPackRegistry([buildCostaRicaDemoBaselinePackFixture()]);

    assert.deepEqual(registry.listByJurisdiction('panama'), []);
    assert.deepEqual(findJurisdictionPacksByCountryCode(registry, 'PA'), []);
    assert.deepEqual(findJurisdictionPacksByCountryCode(registry, 'US'), []);
  });
});
