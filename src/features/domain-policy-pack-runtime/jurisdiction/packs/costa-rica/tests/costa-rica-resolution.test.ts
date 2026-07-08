import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createJurisdictionPackRegistry } from '../../../jurisdiction-pack-registry.js';
import { resolveCostaRicaJurisdictionAction } from '../costa-rica-resolution.js';
import { buildCostaRicaCounselReviewedPackFixture, buildCostaRicaCustomerValidatedPackFixture, buildCostaRicaDemoBaselinePackFixture } from '../costa-rica-fixtures.js';
import { buildGlobalBaselineManifestFixture } from '../../../../../policy-pack-foundation/fixtures/policy-pack-foundation-fixtures.js';
import { COSTA_RICA_BASE_PACK_ID } from '../costa-rica-constants.js';

const baseline = () => [buildGlobalBaselineManifestFixture()];

describe('resolveCostaRicaJurisdictionAction resolution scenarios', () => {
  it('scenario 1: a non-sensitive Costa Rica action allows', () => {
    const registry = createJurisdictionPackRegistry([buildCostaRicaDemoBaselinePackFixture()]);

    const resolution = resolveCostaRicaJurisdictionAction({
      compositionId: 'scenario-1',
      jurisdiction: { countryCode: 'CR' },
      legallySensitive: false,
      registry,
      baselineManifests: baseline(),
    });

    assert.equal(resolution.applicable, true);
    assert.equal(resolution.decision, 'allow');
  });

  it('scenario 2: a sensitive Costa Rica action with a demo_baseline pack requires counsel review', () => {
    const registry = createJurisdictionPackRegistry([buildCostaRicaDemoBaselinePackFixture()]);

    const resolution = resolveCostaRicaJurisdictionAction({
      compositionId: 'scenario-2',
      jurisdiction: { countryCode: 'CR' },
      legallySensitive: true,
      registry,
      baselineManifests: baseline(),
      requiredValidationStatus: 'counsel_reviewed',
    });

    assert.equal(resolution.decision, 'require_counsel_review');
    assert.equal(resolution.validationStatusSatisfied, false);
  });

  it('scenario 3: a sensitive Costa Rica action with a customer_validated pack still requires counsel review', () => {
    const registry = createJurisdictionPackRegistry([buildCostaRicaCustomerValidatedPackFixture()]);

    const resolution = resolveCostaRicaJurisdictionAction({
      compositionId: 'scenario-3',
      jurisdiction: { countryCode: 'CR' },
      legallySensitive: true,
      registry,
      baselineManifests: baseline(),
      requiredValidationStatus: 'counsel_reviewed',
    });

    assert.equal(resolution.decision, 'require_counsel_review');
    assert.equal(resolution.validationStatusSatisfied, false);
  });

  it('scenario 4: a sensitive Costa Rica action with a counsel_reviewed pack allows once requirements are satisfied', () => {
    const registry = createJurisdictionPackRegistry([buildCostaRicaCounselReviewedPackFixture()]);

    const resolution = resolveCostaRicaJurisdictionAction({
      compositionId: 'scenario-4',
      jurisdiction: { countryCode: 'CR' },
      legallySensitive: true,
      registry,
      baselineManifests: baseline(),
      requiredValidationStatus: 'counsel_reviewed',
    });

    assert.equal(resolution.decision, 'allow');
    assert.equal(resolution.validationStatusSatisfied, true);
  });

  it('scenario 5: ambiguous Costa Rica jurisdiction requires review', () => {
    const registry = createJurisdictionPackRegistry([buildCostaRicaCounselReviewedPackFixture()]);

    const resolution = resolveCostaRicaJurisdictionAction({
      compositionId: 'scenario-5',
      jurisdiction: { countryCode: 'CR', ambiguous: true },
      legallySensitive: false,
      registry,
      baselineManifests: baseline(),
    });

    assert.equal(resolution.decision, 'require_review');
    assert.equal(resolution.validationStatusSatisfied, false);
  });

  it('scenario 6: conflicting Costa Rica jurisdiction requires review', () => {
    const registry = createJurisdictionPackRegistry([buildCostaRicaCounselReviewedPackFixture()]);

    const resolution = resolveCostaRicaJurisdictionAction({
      compositionId: 'scenario-6',
      jurisdiction: { countryCode: 'CR', conflictDetected: true },
      legallySensitive: false,
      registry,
      baselineManifests: baseline(),
    });

    assert.equal(resolution.decision, 'require_review');
    assert.equal(resolution.validationStatusSatisfied, false);
  });

  it('scenario 7: a missing Costa Rica pack requires review', () => {
    const registry = createJurisdictionPackRegistry([]);

    const resolution = resolveCostaRicaJurisdictionAction({
      compositionId: 'scenario-7',
      jurisdiction: { countryCode: 'CR' },
      legallySensitive: true,
      registry,
      baselineManifests: baseline(),
      requiredValidationStatus: 'counsel_reviewed',
    });

    assert.ok(['require_review', 'require_counsel_review'].includes(resolution.decision));
    assert.ok(resolution.missingPackIds.includes(COSTA_RICA_BASE_PACK_ID));
  });

  it('a non-Costa-Rica jurisdiction is not applicable and defaults to allow', () => {
    const registry = createJurisdictionPackRegistry([buildCostaRicaDemoBaselinePackFixture()]);

    const resolution = resolveCostaRicaJurisdictionAction({
      compositionId: 'non-cr',
      jurisdiction: { countryCode: 'PA' },
      legallySensitive: true,
      registry,
    });

    assert.equal(resolution.applicable, false);
    assert.equal(resolution.decision, 'allow');
  });
});
