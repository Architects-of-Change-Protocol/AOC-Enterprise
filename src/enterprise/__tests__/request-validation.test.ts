import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateGovernanceEvaluateRequestBody, toKernelEvaluationRequest, toKernelEvaluationOptions } from '../api/governance-evaluate-contract.js';
import { EnterpriseHttpError } from '../api/enterprise-http-errors.js';
import { buildAllowedRequestBody } from './support.js';

describe('validateGovernanceEvaluateRequestBody', () => {
  it('accepts a well-formed body unchanged', () => {
    const body = buildAllowedRequestBody();
    assert.deepEqual(validateGovernanceEvaluateRequestBody(body), body);
  });

  it('rejects a non-object body', () => {
    assert.throws(() => validateGovernanceEvaluateRequestBody('not an object'), EnterpriseHttpError);
    assert.throws(() => validateGovernanceEvaluateRequestBody(null), EnterpriseHttpError);
    assert.throws(() => validateGovernanceEvaluateRequestBody([1, 2, 3]), EnterpriseHttpError);
  });

  it('rejects a missing/empty actor.id or actor.trustDomainId', () => {
    assert.throws(() => validateGovernanceEvaluateRequestBody({ actor: {}, action: { type: 'x', resourceScope: 'y' } }));
    assert.throws(() => validateGovernanceEvaluateRequestBody({ actor: { id: 'a' }, action: { type: 'x', resourceScope: 'y' } }));
    assert.throws(() => validateGovernanceEvaluateRequestBody({ actor: { id: '', trustDomainId: 'td' }, action: { type: 'x', resourceScope: 'y' } }));
  });

  it('rejects a missing/empty action.type or action.resourceScope', () => {
    assert.throws(() => validateGovernanceEvaluateRequestBody({ actor: { id: 'a', trustDomainId: 'td' }, action: {} }));
    assert.throws(() => validateGovernanceEvaluateRequestBody({ actor: { id: 'a', trustDomainId: 'td' }, action: { type: 'x' } }));
  });

  it('rejects a malformed organization or correlationId', () => {
    const base = buildAllowedRequestBody();
    assert.throws(() => validateGovernanceEvaluateRequestBody({ ...base, organization: { name: 'no id' } }));
    assert.throws(() => validateGovernanceEvaluateRequestBody({ ...base, correlationId: 123 }));
  });

  it('collects every violation into EnterpriseHttpError.details', () => {
    try {
      validateGovernanceEvaluateRequestBody({ actor: {}, action: {} });
      assert.fail('expected validation to throw');
    } catch (error) {
      assert.ok(error instanceof EnterpriseHttpError);
      assert.equal(error.httpStatus, 400);
      assert.equal(error.details?.length, 2);
    }
  });
});

describe('toKernelEvaluationRequest', () => {
  it('generates requestId/requestedAt when the caller omits them', () => {
    const body = buildAllowedRequestBody();
    const clock = { now: () => '2026-02-02T00:00:00.000Z' };
    const idGenerator = { nextId: (prefix: string) => `${prefix}-generated` };

    const request = toKernelEvaluationRequest(body, clock, idGenerator);
    assert.equal(request.requestId, 'enterprise-request-generated');
    assert.equal(request.requestedAt, '2026-02-02T00:00:00.000Z');
  });

  it('preserves a caller-supplied requestId/requestedAt', () => {
    const body = buildAllowedRequestBody({ requestId: 'req-explicit', requestedAt: '2020-01-01T00:00:00.000Z' });
    const request = toKernelEvaluationRequest(body, { now: () => 'unused' }, { nextId: () => 'unused' });
    assert.equal(request.requestId, 'req-explicit');
    assert.equal(request.requestedAt, '2020-01-01T00:00:00.000Z');
  });
});

describe('toKernelEvaluationOptions', () => {
  it('defaults traceLevel to the Enterprise configuration when the caller omits it', () => {
    assert.deepEqual(toKernelEvaluationOptions(buildAllowedRequestBody(), 'full'), { traceLevel: 'full' });
  });

  it('lets the caller override traceLevel and dryRun per-request', () => {
    assert.deepEqual(toKernelEvaluationOptions(buildAllowedRequestBody({ traceLevel: 'basic', dryRun: true }), 'full'), { traceLevel: 'basic', dryRun: true });
  });
});
