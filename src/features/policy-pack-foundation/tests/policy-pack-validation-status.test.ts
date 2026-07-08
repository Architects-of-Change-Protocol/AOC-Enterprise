import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { satisfiesPolicyPackValidationStatus } from '../validation/policy-pack-validation-status.js';

describe('satisfiesPolicyPackValidationStatus', () => {
  it('13. demo_baseline satisfies only demo_baseline', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('demo_baseline', 'demo_baseline'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('demo_baseline', 'customer_validated'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('demo_baseline', 'counsel_reviewed'), false);
  });

  it('14. customer_provided satisfies only customer_provided', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('customer_provided', 'customer_provided'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('customer_provided', 'customer_validated'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('customer_provided', 'counsel_reviewed'), false);
  });

  it('15. customer_validated does not satisfy counsel_reviewed', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('customer_validated', 'customer_validated'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('customer_validated', 'customer_provided'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('customer_validated', 'counsel_reviewed'), false);
  });

  it('16. counsel_reviewed satisfies counsel_reviewed and below', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('counsel_reviewed', 'counsel_reviewed'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('counsel_reviewed', 'customer_validated'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('counsel_reviewed', 'customer_provided'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('counsel_reviewed', 'counsel_attested'), false);
  });

  it('17. counsel_attested satisfies counsel_attested and counsel_reviewed', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('counsel_attested', 'counsel_attested'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('counsel_attested', 'counsel_reviewed'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('counsel_attested', 'counsel_review_requested'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('counsel_attested', 'customer_validated'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('counsel_attested', 'customer_provided'), true);
  });

  it('18. expired/superseded/disabled do not satisfy active statuses', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('expired', 'counsel_reviewed'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('expired', 'expired'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('superseded', 'customer_validated'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('superseded', 'superseded'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('disabled', 'customer_provided'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('disabled', 'disabled'), true);
  });

  it('operator_reviewed satisfies operator_reviewed and customer_provided, not customer_validated', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('operator_reviewed', 'operator_reviewed'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('operator_reviewed', 'customer_provided'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('operator_reviewed', 'customer_validated'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('operator_reviewed', 'counsel_reviewed'), false);
  });

  it('compliance_reviewed/privacy_reviewed/security_reviewed each satisfy only their own lane plus customer statuses', () => {
    assert.equal(satisfiesPolicyPackValidationStatus('compliance_reviewed', 'customer_validated'), true);
    assert.equal(satisfiesPolicyPackValidationStatus('compliance_reviewed', 'counsel_reviewed'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('privacy_reviewed', 'security_reviewed'), false);
    assert.equal(satisfiesPolicyPackValidationStatus('security_reviewed', 'privacy_reviewed'), false);
  });
});
