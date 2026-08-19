import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseAocPMFreakRemoteGovernanceRequestBody } from '../aoc-pmfreak-remote-governance-parser.js';
import { demoAocPMFreakBillingAllowedRequest } from '../../pmfreak-governance-request-intake/index.js';

describe('Soberanía PMFreak Remote Governance Endpoint -- parser', () => {
  it('accepts a well-formed PMFreak governance request', () => {
    const result = parseAocPMFreakRemoteGovernanceRequestBody(demoAocPMFreakBillingAllowedRequest);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.request.requestId, demoAocPMFreakBillingAllowedRequest.requestId);
    }
  });

  it('rejects a null body', () => {
    const result = parseAocPMFreakRemoteGovernanceRequestBody(null);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'invalid_request');
  });

  it('rejects a string body', () => {
    const result = parseAocPMFreakRemoteGovernanceRequestBody('not an object');
    assert.equal(result.ok, false);
  });

  it('rejects an array body', () => {
    const result = parseAocPMFreakRemoteGovernanceRequestBody([]);
    assert.equal(result.ok, false);
  });

  it('rejects an empty object', () => {
    const result = parseAocPMFreakRemoteGovernanceRequestBody({});
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'invalid_request');
  });

  it('rejects a body missing actionAttempt', () => {
    const { actionAttempt, ...withoutActionAttempt } = demoAocPMFreakBillingAllowedRequest;
    void actionAttempt;
    const result = parseAocPMFreakRemoteGovernanceRequestBody(withoutActionAttempt);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok((result.error.details?.missingFields as string[]).includes('actionAttempt'));
  });

  it('rejects a body whose evidenceContext is missing its array fields', () => {
    const malformed = { ...demoAocPMFreakBillingAllowedRequest, evidenceContext: { evidenceReferenceIds: [] } };
    const result = parseAocPMFreakRemoteGovernanceRequestBody(malformed);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok((result.error.details?.missingFields as string[]).includes('evidenceContext'));
  });

  it('defaults missing safeLabels/warnings/errors to empty arrays', () => {
    const { safeLabels, warnings, errors, ...withoutArrays } = demoAocPMFreakBillingAllowedRequest;
    void safeLabels;
    void warnings;
    void errors;
    const result = parseAocPMFreakRemoteGovernanceRequestBody(withoutArrays);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.request.safeLabels, []);
      assert.deepEqual(result.request.warnings, []);
      assert.deepEqual(result.request.errors, []);
    }
  });
});
