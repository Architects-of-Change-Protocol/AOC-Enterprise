import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleAocPMFreakRemoteGovernanceRequest } from '../aoc-pmfreak-remote-governance-endpoint-handler.js';
import {
  demoAocPMFreakRemoteAuthFailureRequest,
  demoAocPMFreakRemoteBillingAllowedEndpointRequest,
  demoAocPMFreakRemoteBillingMissingApprovalEndpointRequest,
  demoAocPMFreakRemoteBillingMissingEvidenceEndpointRequest,
  demoAocPMFreakRemoteCancelledEndpointRequest,
  demoAocPMFreakRemoteInvalidContentTypeRequest,
  demoAocPMFreakRemoteInvalidMethodRequest,
  demoAocPMFreakRemotePayloadTooLargeRequest,
} from '../aoc-pmfreak-remote-governance-fixtures.js';
import { AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH } from '../aoc-pmfreak-remote-governance-endpoint-constants.js';
import type { AocPMFreakRemoteGovernanceEndpointRequest } from '../aoc-pmfreak-remote-governance-endpoint-types.js';

interface SuccessBodyShape {
  readonly ok: true;
  readonly response: { readonly decision: string };
}

interface ErrorBodyShape {
  readonly ok: false;
  readonly error: { readonly code: string };
}

describe('AOC PMFreak Remote Governance Endpoint -- pure handler', () => {
  it('evaluates a billing-missing-evidence request and returns HTTP 200 with decision require_evidence', async () => {
    const result = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteBillingMissingEvidenceEndpointRequest });
    assert.equal(result.status, 200);
    assert.equal((result.body as SuccessBodyShape).response.decision, 'require_evidence');
  });

  it('evaluates a billing-missing-approval request and returns HTTP 200 with decision require_billing_review', async () => {
    const result = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteBillingMissingApprovalEndpointRequest });
    assert.equal(result.status, 200);
    assert.equal((result.body as SuccessBodyShape).response.decision, 'require_billing_review');
  });

  it('evaluates a complete billing request and returns HTTP 200 with decision allow', async () => {
    const result = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteBillingAllowedEndpointRequest });
    assert.equal(result.status, 200);
    assert.equal((result.body as SuccessBodyShape).response.decision, 'allow');
  });

  it('evaluates a cancelled action and returns HTTP 200 with decision deny', async () => {
    const result = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteCancelledEndpointRequest });
    assert.equal(result.status, 200);
    assert.equal((result.body as SuccessBodyShape).response.decision, 'deny');
  });

  it('a governance decision of deny/hold/require_* still returns HTTP 200, never a non-200 status', async () => {
    for (const request of [demoAocPMFreakRemoteBillingMissingEvidenceEndpointRequest, demoAocPMFreakRemoteBillingMissingApprovalEndpointRequest, demoAocPMFreakRemoteCancelledEndpointRequest]) {
      const result = await handleAocPMFreakRemoteGovernanceRequest({ request });
      assert.equal(result.status, 200);
    }
  });

  it('rejects a disallowed method with a safe HTTP 405', async () => {
    const result = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteInvalidMethodRequest });
    assert.equal(result.status, 405);
    assert.equal((result.body as ErrorBodyShape).ok, false);
    assert.equal((result.body as ErrorBodyShape).error.code, 'invalid_method');
  });

  it('rejects an unsupported content type with a safe HTTP 415', async () => {
    const result = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteInvalidContentTypeRequest });
    assert.equal(result.status, 415);
    assert.equal((result.body as ErrorBodyShape).error.code, 'unsupported_content_type');
  });

  it('rejects an oversized payload with a safe HTTP 413', async () => {
    const result = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemotePayloadTooLargeRequest });
    assert.equal(result.status, 413);
    assert.equal((result.body as ErrorBodyShape).error.code, 'payload_too_large');
  });

  it('rejects a failed shared-secret auth attempt with a safe HTTP 403', async () => {
    const result = await handleAocPMFreakRemoteGovernanceRequest({
      request: demoAocPMFreakRemoteAuthFailureRequest,
      config: { authMode: 'shared_secret_header', sharedSecretValue: 'demo-correct-secret' },
    });
    assert.equal(result.status, 403);
    assert.equal((result.body as ErrorBodyShape).error.code, 'auth_failed');
  });

  it('rejects a production config with none_demo auth with a safe HTTP 503, without evaluating the request', async () => {
    const result = await handleAocPMFreakRemoteGovernanceRequest({
      request: demoAocPMFreakRemoteBillingAllowedEndpointRequest,
      config: { environment: 'production', authMode: 'none_demo' },
    });
    assert.equal(result.status, 503);
    assert.equal((result.body as ErrorBodyShape).error.code, 'unsafe_production_config');
  });

  it('rejects an invalid (malformed) request body with a safe HTTP 400', async () => {
    const malformedRequest: AocPMFreakRemoteGovernanceEndpointRequest = {
      method: 'POST',
      path: AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH,
      headers: { 'content-type': 'application/json' },
      body: { not: 'a governance request' },
    };
    const result = await handleAocPMFreakRemoteGovernanceRequest({ request: malformedRequest });
    assert.equal(result.status, 400);
    assert.equal((result.body as ErrorBodyShape).error.code, 'invalid_request');
  });

  it('accepts a valid production config with shared_secret_header auth', async () => {
    const request: AocPMFreakRemoteGovernanceEndpointRequest = {
      ...demoAocPMFreakRemoteBillingAllowedEndpointRequest,
      headers: { 'content-type': 'application/json', 'x-aoc-governance-secret': 'demo-correct-secret' },
    };
    const result = await handleAocPMFreakRemoteGovernanceRequest({
      request,
      config: { environment: 'production', authMode: 'shared_secret_header', sharedSecretValue: 'demo-correct-secret' },
    });
    assert.equal(result.status, 200);
  });

  it('does not mutate the input request object', async () => {
    const request = demoAocPMFreakRemoteBillingAllowedEndpointRequest;
    const snapshot = JSON.parse(JSON.stringify(request));
    await handleAocPMFreakRemoteGovernanceRequest({ request });
    assert.deepEqual(JSON.parse(JSON.stringify(request)), snapshot);
  });

  it('is deterministic across repeated calls with the same request', async () => {
    const first = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteBillingAllowedEndpointRequest });
    const second = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteBillingAllowedEndpointRequest });
    assert.deepEqual(first, second);
  });

  it('response headers always include content-type and x-aoc-endpoint-id', async () => {
    const success = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteBillingAllowedEndpointRequest });
    const failure = await handleAocPMFreakRemoteGovernanceRequest({ request: demoAocPMFreakRemoteInvalidMethodRequest });

    for (const result of [success, failure]) {
      assert.equal(result.headers['content-type'], 'application/json');
      assert.equal(result.headers['x-aoc-endpoint-id'], 'aoc.integration.pmfreak.remote_governance_endpoint.v1');
    }
  });
});
