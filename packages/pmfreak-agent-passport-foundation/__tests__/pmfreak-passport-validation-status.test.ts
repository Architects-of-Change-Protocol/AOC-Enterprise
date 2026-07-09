import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PMFREAK_PASSPORT_VALIDATION_STATUSES,
  satisfiesPMFreakPassportValidationStatus,
} from '../src/domain/pmfreak-passport-validation-status.js';

describe('PMFreak passport validation-status lattice', () => {
  it('has exactly 15 statuses', () => {
    assert.equal(PMFREAK_PASSPORT_VALIDATION_STATUSES.length, 15);
  });

  it('every status satisfies itself (reflexivity)', () => {
    for (const status of PMFREAK_PASSPORT_VALIDATION_STATUSES) {
      assert.ok(satisfiesPMFreakPassportValidationStatus(status, status), `${status} should satisfy itself`);
    }
  });

  it('counsel_attested satisfies every status below it in the counsel/customer chain', () => {
    assert.ok(satisfiesPMFreakPassportValidationStatus('counsel_attested', 'counsel_reviewed'));
    assert.ok(satisfiesPMFreakPassportValidationStatus('counsel_attested', 'counsel_review_requested'));
    assert.ok(satisfiesPMFreakPassportValidationStatus('counsel_attested', 'customer_validated'));
    assert.ok(satisfiesPMFreakPassportValidationStatus('counsel_attested', 'customer_provided'));
  });

  it('a lower-trust status never satisfies a higher-trust requirement', () => {
    assert.equal(satisfiesPMFreakPassportValidationStatus('demo_baseline', 'counsel_reviewed'), false);
    assert.equal(satisfiesPMFreakPassportValidationStatus('customer_provided', 'counsel_attested'), false);
    assert.equal(satisfiesPMFreakPassportValidationStatus('operator_reviewed', 'security_reviewed'), false);
    assert.equal(satisfiesPMFreakPassportValidationStatus('customer_validated', 'compliance_reviewed'), false);
  });

  it('terminal statuses satisfy only themselves', () => {
    for (const terminal of ['expired', 'superseded', 'disabled'] as const) {
      for (const required of PMFREAK_PASSPORT_VALIDATION_STATUSES) {
        const expected = required === terminal;
        assert.equal(satisfiesPMFreakPassportValidationStatus(terminal, required), expected, `${terminal} -> ${required}`);
      }
    }
  });

  it('the review-track statuses (security/privacy/compliance) do not satisfy one another', () => {
    assert.equal(satisfiesPMFreakPassportValidationStatus('security_reviewed', 'privacy_reviewed'), false);
    assert.equal(satisfiesPMFreakPassportValidationStatus('privacy_reviewed', 'compliance_reviewed'), false);
    assert.equal(satisfiesPMFreakPassportValidationStatus('compliance_reviewed', 'security_reviewed'), false);
  });

  it('demo_baseline never satisfies system_baseline or vice versa', () => {
    assert.equal(satisfiesPMFreakPassportValidationStatus('demo_baseline', 'system_baseline'), false);
    assert.equal(satisfiesPMFreakPassportValidationStatus('system_baseline', 'demo_baseline'), false);
  });
});
