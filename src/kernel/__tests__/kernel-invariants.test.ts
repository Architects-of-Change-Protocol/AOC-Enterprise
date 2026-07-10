import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { KernelEvaluationRequest } from '../contracts/kernel-request.js';
import type { KernelEvaluationResult } from '../contracts/kernel-result.js';
import { KernelInvariantError } from '../errors/kernel-errors.js';
import { assertKernelInvariants, assertReasonCodesPresent, assertRecognitionPrecedesAllow, assertRequestNotMutated } from '../orchestration/kernel-invariants.js';

const REQUEST: KernelEvaluationRequest = {
  requestId: 'req-1',
  actor: { id: 'actor-victor', trustDomainId: 'trust-domain-datasys' },
  action: { type: 'draft_closure_email', resourceScope: 'project:HMP-14665' },
  requestedAt: '2026-01-01T00:00:00.000Z',
};

function baseResult(overrides: Partial<KernelEvaluationResult>): KernelEvaluationResult {
  return {
    requestId: 'req-1',
    decisionId: 'decision-1',
    status: 'allowed',
    reasonCodes: ['ACTION_ALLOWED'],
    summary: 'ok',
    recognition: { performed: true, recognized: true },
    authority: { performed: false },
    policies: [],
    approval: { performed: false, status: 'not_applicable' },
    evidence: [],
    trace: { steps: [], decisionId: 'decision-1', kernelVersion: '1.0.0' },
    evaluatedAt: '2026-01-01T00:00:00.000Z',
    kernelVersion: '1.0.0',
    ...overrides,
  };
}

describe('assertRecognitionPrecedesAllow', () => {
  it('passes when an allowed status is backed by a performed, recognized recognition evaluation', () => {
    assert.doesNotThrow(() => assertRecognitionPrecedesAllow(baseResult({})));
  });

  it('throws if a decision is allowed without recognition ever performing', () => {
    assert.throws(() => assertRecognitionPrecedesAllow(baseResult({ recognition: { performed: false } })), KernelInvariantError);
  });

  it('throws if a decision is allowed while recognition explicitly did not recognize the actor', () => {
    assert.throws(() => assertRecognitionPrecedesAllow(baseResult({ recognition: { performed: true, recognized: false } })), KernelInvariantError);
  });

  it('does not apply to denied/approval_required/indeterminate statuses', () => {
    assert.doesNotThrow(() => assertRecognitionPrecedesAllow(baseResult({ status: 'denied', recognition: { performed: false } })));
  });
});

describe('assertReasonCodesPresent', () => {
  it('passes when at least one reason code is present', () => {
    assert.doesNotThrow(() => assertReasonCodesPresent(baseResult({})));
  });

  it('throws when reasonCodes is empty', () => {
    assert.throws(() => assertReasonCodesPresent(baseResult({ reasonCodes: [] })), KernelInvariantError);
  });
});

describe('assertRequestNotMutated', () => {
  it('passes when the request is structurally unchanged', () => {
    assert.doesNotThrow(() => assertRequestNotMutated(REQUEST, { ...REQUEST }));
  });

  it('throws when a top-level field changed', () => {
    assert.throws(() => assertRequestNotMutated(REQUEST, { ...REQUEST, requestId: 'mutated' }), KernelInvariantError);
  });

  it('throws when a nested field changed', () => {
    assert.throws(() => assertRequestNotMutated(REQUEST, { ...REQUEST, actor: { ...REQUEST.actor, id: 'mutated' } }), KernelInvariantError);
  });
});

describe('assertKernelInvariants', () => {
  it('runs all three checks together without throwing for a consistent allowed result', () => {
    assert.doesNotThrow(() => assertKernelInvariants(REQUEST, { ...REQUEST }, baseResult({})));
  });
});
