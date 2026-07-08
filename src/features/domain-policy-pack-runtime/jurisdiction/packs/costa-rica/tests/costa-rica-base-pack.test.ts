import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCostaRicaJurisdictionDescriptor } from '../costa-rica-jurisdiction-descriptor.js';
import { createCostaRicaBaseJurisdictionPack } from '../costa-rica-base-pack.js';
import { validateJurisdictionPack } from '../../../jurisdiction-pack-validator.js';
import { assertNoPolicyPackOverclaim } from '../../../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { satisfiesPolicyPackValidationStatus } from '../../../../../policy-pack-foundation/validation/policy-pack-validation-status.js';
import { COSTA_RICA_BASE_PACK_ID, COSTA_RICA_JURISDICTION_COUNTRY_CODE, COSTA_RICA_REQUIRED_BASELINE_PACK_ID } from '../costa-rica-constants.js';

describe('Costa Rica Base Pack v1', () => {
  it('1. creates a Costa Rica jurisdiction descriptor with no compliance claim', () => {
    const descriptor = createCostaRicaJurisdictionDescriptor();

    assert.equal(descriptor.countryCode, 'CR');
    assert.equal(descriptor.known, true);
    assert.equal(descriptor.ambiguous, false);
    assert.equal(descriptor.conflictDetected, false);
    assertNoPolicyPackOverclaim(descriptor);
  });

  it('2. creates the Costa Rica base pack with a real PolicyPackManifest', () => {
    const pack = createCostaRicaBaseJurisdictionPack();

    assert.equal(pack.manifest.id, COSTA_RICA_BASE_PACK_ID);
    assert.equal(pack.manifest.kind, 'jurisdiction_pack');
    assert.equal(pack.manifest.domain, 'jurisdiction');
    assert.equal(pack.jurisdiction.countryCode, COSTA_RICA_JURISDICTION_COUNTRY_CODE);
    assert.equal(pack.manifest.scope.jurisdictionSpecific, true);
    assert.equal(pack.manifest.scope.domainSpecific, false);
    assert.equal(pack.manifest.scope.useCaseSpecific, false);
    assert.equal(pack.manifest.scope.customerSpecific, false);
    assert.equal(pack.manifest.scope.systemAuthored, true);
    assert.equal(pack.manifest.safeFraming.notLegalAdvice, true);
    assert.equal(pack.manifest.safeFraming.notComplianceCertification, true);
    assert.equal(pack.manifest.safeFraming.noCompletenessClaim, true);
    assert.equal(pack.manifest.safeFraming.noJurisdictionalComplianceClaim, true);
    assert.equal(pack.manifest.safeFraming.partialPolicyModel, true);
    assert.equal(pack.manifest.safeFraming.requiresCustomerValidation, true);
    assert.equal(pack.manifest.safeFraming.requiresCounselReviewWhenApplicable, true);
    assert.ok(pack.manifest.requiredPackIds.includes(COSTA_RICA_REQUIRED_BASELINE_PACK_ID));
    assert.ok(pack.manifest.labels.includes('costa_rica_jurisdiction_context'));
  });

  it('defaults to demo_baseline / system_authored', () => {
    const pack = createCostaRicaBaseJurisdictionPack();
    assert.equal(pack.manifest.status, 'demo_baseline');
    assert.equal(pack.manifest.sourceStatus, 'system_authored');
    assert.equal(pack.manifest.scope.demoOnly, true);
  });

  it('3. validates as a well-formed jurisdiction pack', () => {
    const pack = createCostaRicaBaseJurisdictionPack();
    const result = validateJurisdictionPack(pack);

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('4. the default status does not satisfy a counsel_reviewed requirement', () => {
    const pack = createCostaRicaBaseJurisdictionPack();
    assert.equal(pack.manifest.status, 'demo_baseline');
    assert.equal(satisfiesPolicyPackValidationStatus(pack.manifest.status, 'counsel_reviewed'), false);
  });

  it('customer_validated status still does not satisfy counsel_reviewed', () => {
    const pack = createCostaRicaBaseJurisdictionPack({ status: 'customer_validated', sourceStatus: 'customer_validated' });
    assert.equal(satisfiesPolicyPackValidationStatus(pack.manifest.status, 'counsel_reviewed'), false);
  });

  it('a counsel_reviewed status does satisfy a counsel_reviewed requirement', () => {
    const pack = createCostaRicaBaseJurisdictionPack({ status: 'counsel_reviewed', sourceStatus: 'counsel_reviewed' });
    assert.equal(satisfiesPolicyPackValidationStatus(pack.manifest.status, 'counsel_reviewed'), true);
  });

  it('5. the Costa Rica pack does not claim compliance', () => {
    const pack = createCostaRicaBaseJurisdictionPack();
    assertNoPolicyPackOverclaim(pack);
  });
});
