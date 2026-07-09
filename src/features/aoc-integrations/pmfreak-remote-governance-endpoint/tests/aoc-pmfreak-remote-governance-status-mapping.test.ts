import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapAocPMFreakRemoteGovernanceErrorToStatus } from '../aoc-pmfreak-remote-governance-status-mapping.js';
import { createAocPMFreakRemoteGovernanceEndpointError } from '../aoc-pmfreak-remote-governance-errors.js';
import type { AocPMFreakRemoteGovernanceEndpointErrorCode } from '../aoc-pmfreak-remote-governance-endpoint-types.js';

const EXPECTED_STATUS_BY_CODE: Readonly<Record<AocPMFreakRemoteGovernanceEndpointErrorCode, number>> = {
  invalid_method: 405,
  unsupported_content_type: 415,
  payload_too_large: 413,
  auth_required: 401,
  auth_failed: 403,
  unsafe_production_config: 503,
  invalid_request: 400,
  evaluation_failed: 500,
  serialization_failed: 500,
  unsafe_claim: 500,
  mutation_not_allowed: 500,
  unknown_error: 500,
};

describe('AOC PMFreak Remote Governance Endpoint -- status mapping', () => {
  for (const [code, expectedStatus] of Object.entries(EXPECTED_STATUS_BY_CODE)) {
    it(`maps "${code}" to HTTP ${expectedStatus}`, () => {
      const error = createAocPMFreakRemoteGovernanceEndpointError(code as AocPMFreakRemoteGovernanceEndpointErrorCode, 'demo message');
      assert.equal(mapAocPMFreakRemoteGovernanceErrorToStatus(error), expectedStatus);
    });
  }

  it('covers every declared error code', () => {
    const codes = Object.keys(EXPECTED_STATUS_BY_CODE);
    assert.equal(codes.length, 12);
  });
});
