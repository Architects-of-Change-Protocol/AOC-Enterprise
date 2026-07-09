import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { serializeAocPMFreakRemoteGovernanceError, serializeAocPMFreakRemoteGovernanceSuccess } from '../aoc-pmfreak-remote-governance-serializer.js';
import { createAocPMFreakRemoteGovernanceEndpointConfig } from '../aoc-pmfreak-remote-governance-endpoint-config.js';
import { createAocPMFreakRemoteGovernanceEndpointError } from '../aoc-pmfreak-remote-governance-errors.js';
import { AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID } from '../aoc-pmfreak-remote-governance-endpoint-constants.js';
import { demoAocPMFreakBillingAllowedRequest, evaluateAocPMFreakGovernanceRequest } from '../../pmfreak-governance-request-intake/index.js';

describe('AOC PMFreak Remote Governance Endpoint -- serializer', () => {
  const config = createAocPMFreakRemoteGovernanceEndpointConfig();

  it('success responses are always HTTP 200, even for a non-allow decision', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingAllowedRequest });
    const serialized = serializeAocPMFreakRemoteGovernanceSuccess({ ...response, decision: 'deny' }, config);
    assert.equal(serialized.status, 200);
  });

  it('success responses include the content-type and endpoint-id headers', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingAllowedRequest });
    const serialized = serializeAocPMFreakRemoteGovernanceSuccess(response, config);

    assert.equal(serialized.headers['content-type'], 'application/json');
    assert.equal(serialized.headers['x-aoc-endpoint-id'], AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID);
  });

  it('success response body is a well-formed success envelope', () => {
    const response = evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingAllowedRequest });
    const serialized = serializeAocPMFreakRemoteGovernanceSuccess(response, config, ['a warning']);
    const body = serialized.body as { ok: boolean; endpointId: string; response: unknown; safeLabels: string[]; warnings: string[] };

    assert.equal(body.ok, true);
    assert.equal(body.endpointId, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID);
    assert.equal(body.response, response);
    assert.ok(body.safeLabels.length > 0);
    assert.deepEqual(body.warnings, ['a warning']);
  });

  it('error responses derive status from the error code', () => {
    const error = createAocPMFreakRemoteGovernanceEndpointError('invalid_method', 'Method not allowed.');
    const serialized = serializeAocPMFreakRemoteGovernanceError(error, config);
    assert.equal(serialized.status, 405);
  });

  it('error responses include the content-type and endpoint-id headers', () => {
    const error = createAocPMFreakRemoteGovernanceEndpointError('invalid_request', 'Invalid request.');
    const serialized = serializeAocPMFreakRemoteGovernanceError(error, config);

    assert.equal(serialized.headers['content-type'], 'application/json');
    assert.equal(serialized.headers['x-aoc-endpoint-id'], AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID);
  });

  it('error response body is a well-formed safe error envelope', () => {
    const error = createAocPMFreakRemoteGovernanceEndpointError('auth_failed', 'Authentication failed.');
    const serialized = serializeAocPMFreakRemoteGovernanceError(error, config);
    const body = serialized.body as { ok: boolean; endpointId: string; error: unknown; safeLabels: string[]; warnings: string[] };

    assert.equal(body.ok, false);
    assert.equal(body.endpointId, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID);
    assert.equal(body.error, error);
    assert.ok(body.safeLabels.length > 0);
    assert.deepEqual(body.warnings, []);
  });
});
