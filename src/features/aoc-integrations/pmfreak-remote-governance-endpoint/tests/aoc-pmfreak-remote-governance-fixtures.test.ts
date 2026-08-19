import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  demoAocPMFreakRemoteAuthFailureRequest,
  demoAocPMFreakRemoteBillingAllowedEndpointRequest,
  demoAocPMFreakRemoteBillingAllowedEndpointResponse,
  demoAocPMFreakRemoteBillingMissingApprovalEndpointRequest,
  demoAocPMFreakRemoteBillingMissingApprovalEndpointResponse,
  demoAocPMFreakRemoteBillingMissingEvidenceEndpointRequest,
  demoAocPMFreakRemoteBillingMissingEvidenceEndpointResponse,
  demoAocPMFreakRemoteCancelledEndpointRequest,
  demoAocPMFreakRemoteCancelledEndpointResponse,
  demoAocPMFreakRemoteInvalidContentTypeRequest,
  demoAocPMFreakRemoteInvalidMethodRequest,
  demoAocPMFreakRemotePayloadTooLargeRequest,
} from '../aoc-pmfreak-remote-governance-fixtures.js';

describe('Soberanía PMFreak Remote Governance Endpoint -- fixtures', () => {
  it('every request fixture is a well-formed POST envelope by default', () => {
    for (const fixture of [demoAocPMFreakRemoteBillingMissingEvidenceEndpointRequest, demoAocPMFreakRemoteBillingMissingApprovalEndpointRequest, demoAocPMFreakRemoteBillingAllowedEndpointRequest, demoAocPMFreakRemoteCancelledEndpointRequest]) {
      assert.equal(fixture.method, 'POST');
      assert.equal(fixture.headers['content-type'], 'application/json');
      assert.ok(fixture.body);
    }
  });

  it('the invalid-method fixture uses a non-POST method', () => {
    assert.notEqual(demoAocPMFreakRemoteInvalidMethodRequest.method.toUpperCase(), 'POST');
  });

  it('the invalid-content-type fixture uses an unsupported content type', () => {
    assert.equal(demoAocPMFreakRemoteInvalidContentTypeRequest.headers['content-type'], 'text/plain');
  });

  it('the payload-too-large fixture body serializes larger than the default 256 KB limit', () => {
    const size = JSON.stringify(demoAocPMFreakRemotePayloadTooLargeRequest.body)?.length ?? 0;
    assert.ok(size > 256 * 1024);
  });

  it('the auth-failure fixture carries a deterministic, obviously-fake secret header', () => {
    assert.equal(demoAocPMFreakRemoteAuthFailureRequest.headers['x-aoc-governance-secret'], 'demo-incorrect-shared-secret');
  });

  it('response fixtures carry the expected governance decision', () => {
    assert.equal((demoAocPMFreakRemoteBillingMissingEvidenceEndpointResponse.body as { response: { decision: string } }).response.decision, 'require_evidence');
    assert.equal((demoAocPMFreakRemoteBillingMissingApprovalEndpointResponse.body as { response: { decision: string } }).response.decision, 'require_billing_review');
    assert.equal((demoAocPMFreakRemoteBillingAllowedEndpointResponse.body as { response: { decision: string } }).response.decision, 'allow');
    assert.equal((demoAocPMFreakRemoteCancelledEndpointResponse.body as { response: { decision: string } }).response.decision, 'deny');
  });

  it('response fixtures are always HTTP 200', () => {
    for (const fixture of [
      demoAocPMFreakRemoteBillingMissingEvidenceEndpointResponse,
      demoAocPMFreakRemoteBillingMissingApprovalEndpointResponse,
      demoAocPMFreakRemoteBillingAllowedEndpointResponse,
      demoAocPMFreakRemoteCancelledEndpointResponse,
    ]) {
      assert.equal(fixture.status, 200);
    }
  });

  it('no fixture uses a real-looking customer name, email, contract number, or invoice number', () => {
    const disallowedPatterns = [/@/, /\binvoice[-_]?\d+\b/i, /\bcontract[-_]?\d+\b/i];
    const haystacks = [
      JSON.stringify(demoAocPMFreakRemoteBillingAllowedEndpointRequest),
      JSON.stringify(demoAocPMFreakRemoteBillingMissingEvidenceEndpointRequest),
      JSON.stringify(demoAocPMFreakRemoteBillingMissingApprovalEndpointRequest),
      JSON.stringify(demoAocPMFreakRemoteCancelledEndpointRequest),
    ];
    for (const haystack of haystacks) {
      for (const pattern of disallowedPatterns) {
        assert.ok(!pattern.test(haystack), `unexpected match for ${pattern} in fixture data`);
      }
    }
  });
});
