import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapDecisionStatusToHttpStatus } from '../api/governance-evaluate-contract.js';
import { RuntimeHttpErrors } from '../api/runtime-http-errors.js';

describe('mapDecisionStatusToHttpStatus', () => {
  it('maps allowed and approval_required to 200 -- both are successful evaluations', () => {
    assert.equal(mapDecisionStatusToHttpStatus('allowed'), 200);
    assert.equal(mapDecisionStatusToHttpStatus('approval_required'), 200);
  });

  it('maps denied to 422 -- a governance denial, not an infrastructure error', () => {
    assert.equal(mapDecisionStatusToHttpStatus('denied'), 422);
  });

  it('maps indeterminate to 503 -- a provider dependency failure', () => {
    assert.equal(mapDecisionStatusToHttpStatus('indeterminate'), 503);
  });
});

describe('RuntimeHttpErrors', () => {
  it('produces the mission-specified status code and machine-readable code for each error kind', () => {
    const cases: readonly [() => { httpStatus: number; code: string }, number, string][] = [
      [() => RuntimeHttpErrors.invalidRequest('x'), 400, 'INVALID_REQUEST'],
      [() => RuntimeHttpErrors.authenticationFailed(), 401, 'AUTHENTICATION_FAILED'],
      [() => RuntimeHttpErrors.authorizationFailed(), 403, 'AUTHORIZATION_FAILED'],
      [() => RuntimeHttpErrors.concurrencyConflict('x'), 409, 'CONCURRENCY_CONFLICT'],
      [() => RuntimeHttpErrors.infrastructureFailure(), 500, 'INFRASTRUCTURE_FAILURE'],
      [() => RuntimeHttpErrors.providerUnavailable(), 503, 'PROVIDER_UNAVAILABLE'],
    ];

    for (const [build, expectedStatus, expectedCode] of cases) {
      const error = build();
      assert.equal(error.httpStatus, expectedStatus);
      assert.equal(error.code, expectedCode);
    }
  });

  it('carries validation details through to the response shape', () => {
    const error = RuntimeHttpErrors.invalidRequest('bad request', ['field a is required']);
    assert.deepEqual(error.details, ['field a is required']);
  });
});
