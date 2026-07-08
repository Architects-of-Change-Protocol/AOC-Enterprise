import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createJurisdictionPackRegistry } from '../jurisdiction-pack-registry.js';
import { resolveJurisdictionPacks } from '../jurisdiction-pack-resolver.js';
import {
  buildCounselAttestedJurisdictionPackFixture,
  buildCounselReviewedJurisdictionPackFixture,
  buildCustomerProvidedJurisdictionPackFixture,
  buildCustomerValidatedJurisdictionPackFixture,
} from '../jurisdiction-pack-fixtures.js';
import { satisfiesPolicyPackValidationStatus } from '../../../policy-pack-foundation/validation/policy-pack-validation-status.js';
import type { JurisdictionPack } from '../jurisdiction-pack-types.js';

function resolveSingle(pack: JurisdictionPack) {
  const registry = createJurisdictionPackRegistry([pack]);
  const [resolution] = resolveJurisdictionPacks({
    compositionId: 'test-composition',
    jurisdictionId: pack.jurisdiction.jurisdictionId,
    registry,
    requiredValidationStatus: 'counsel_reviewed',
  });
  return resolution;
}

describe('Jurisdiction Pack Runtime uses shared PolicyPackValidationStatus semantics', () => {
  it('2. customer_validated does not satisfy a required counsel_reviewed status', () => {
    const resolution = resolveSingle(buildCustomerValidatedJurisdictionPackFixture());
    assert.ok(resolution);
    assert.equal(satisfiesPolicyPackValidationStatus('customer_validated', 'counsel_reviewed'), false);
    assert.equal(resolution?.validationStatusSatisfied, false);
    assert.equal(resolution?.decision, 'require_counsel_review');
  });

  it('3. demo_baseline does not satisfy counsel_reviewed', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('demo_baseline', 'counsel_reviewed'), false);
  });

  it('4. customer_provided does not satisfy counsel_reviewed', () => {
    const resolution = resolveSingle(buildCustomerProvidedJurisdictionPackFixture());
    assert.equal(satisfiesPolicyPackValidationStatus('customer_provided', 'counsel_reviewed'), false);
    assert.equal(resolution?.validationStatusSatisfied, false);
    assert.equal(resolution?.decision, 'require_counsel_review');
  });

  it('5. counsel_attested satisfies counsel_reviewed and allows when other requirements pass', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('counsel_attested', 'counsel_reviewed'), true);

    const resolution = resolveSingle(buildCounselAttestedJurisdictionPackFixture());
    assert.equal(resolution?.validationStatusSatisfied, true);
    assert.equal(resolution?.decision, 'allow');
  });

  it('counsel_reviewed satisfies counsel_reviewed', () => {
    const resolution = resolveSingle(buildCounselReviewedJurisdictionPackFixture());
    assert.equal(resolution?.validationStatusSatisfied, true);
    assert.equal(resolution?.decision, 'allow');
  });

  it('expired, superseded, and disabled statuses are terminal', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('expired', 'counsel_reviewed'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('superseded', 'counsel_reviewed'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('disabled', 'counsel_reviewed'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('expired', 'expired'), true);
  });

  it('15. no duplicate validation status lattice: resolution decisions are produced by composePolicyPacks, not a jurisdiction-only table', () => {
    const resolution = resolveSingle(buildCustomerProvidedJurisdictionPackFixture());
    // `decision` and `validationStatusSatisfied` on the resolution are the exact
    // fields composePolicyPacks() returns on its PolicyPackCompositionResult --
    // if this module maintained a second table, this composition object would
    // need post-processing to match; it does not.
    assert.equal(resolution?.decision, resolution?.composition.decision);
    assert.equal(resolution?.validationStatusSatisfied, resolution?.composition.validationStatusSatisfied);
  });
});
