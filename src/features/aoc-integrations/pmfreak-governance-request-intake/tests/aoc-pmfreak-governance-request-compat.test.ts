import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { demoAocPMFreakBillingAllowedRequest } from '../aoc-pmfreak-governance-intake-fixtures.js';
import { validateAocPMFreakGovernanceRequest } from '../aoc-pmfreak-governance-intake-validator.js';

describe('Soberanía PMFreak Governance Request Intake -- request compatibility shape', () => {
  it('accepts the PMFreak Governance Request Client v1 shape (providerId/consumerOf/requestMode)', () => {
    const request = demoAocPMFreakBillingAllowedRequest;

    assert.equal(request.providerId, 'pmfreak');
    assert.equal(request.consumerOf, 'aoc');
    assert.ok(request.requestMode === 'dry_run' || request.requestMode === 'evaluate_only');
    assert.ok(typeof request.requestId === 'string' && request.requestId.length > 0);
    assert.ok(typeof request.clientId === 'string' && request.clientId.length > 0);
  });

  it('carries every context block PMFreak Governance Request Client v1 sends', () => {
    const request = demoAocPMFreakBillingAllowedRequest;

    assert.ok(request.actionAttempt);
    assert.ok(request.projectContext);
    assert.ok(request.agentContext);
    assert.ok(request.actionContext);
    assert.ok(request.evidenceContext);
    assert.ok(request.approvalContext);
    assert.ok(Array.isArray(request.safeLabels));
    assert.ok(Array.isArray(request.warnings));
    assert.ok(Array.isArray(request.errors));
  });

  it('is a request the intake validator accepts as structurally valid', () => {
    const result = validateAocPMFreakGovernanceRequest(demoAocPMFreakBillingAllowedRequest);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });
});
