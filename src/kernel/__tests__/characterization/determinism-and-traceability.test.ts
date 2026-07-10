import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDraftClosureEmailGuardInput } from '../../../features/action-enforcement/fixtures/allowed-action.fixture.js';
import { buildUnknownAgentReadGuardInput } from '../../../features/action-enforcement/fixtures/denied-action.fixture.js';
import { buildKernelParityWorld, toKernelRequest } from './support.js';

describe('Kernel characterization: determinism', () => {
  it('the same normalized request against the same kernel state returns the same logical outcome', async () => {
    const { kernel } = buildKernelParityWorld();
    const request = toKernelRequest(buildDraftClosureEmailGuardInput());

    const first = await kernel.evaluate({ ...request, requestId: 'determinism-req-1' });
    const second = await kernel.evaluate({ ...request, requestId: 'determinism-req-1' });

    assert.equal(first.status, second.status);
    assert.deepEqual(first.reasonCodes, second.reasonCodes);
    assert.equal(first.summary, second.summary);
    assert.deepEqual(
      first.policies.map((p) => ({ policyId: p.policyId, passed: p.passed, reasonCode: p.reasonCode })),
      second.policies.map((p) => ({ policyId: p.policyId, passed: p.passed, reasonCode: p.reasonCode })),
    );
    assert.equal(first.evaluatedAt, second.evaluatedAt, 'the manual clock did not advance between calls');
  });

  it('a denial scenario is equally deterministic across repeated evaluations', async () => {
    const { kernel } = buildKernelParityWorld();
    const request = toKernelRequest(buildUnknownAgentReadGuardInput());

    const first = await kernel.evaluate({ ...request, requestId: 'determinism-req-2' });
    const second = await kernel.evaluate({ ...request, requestId: 'determinism-req-2' });

    assert.equal(first.status, 'denied');
    assert.equal(second.status, 'denied');
    assert.deepEqual(first.reasonCodes, second.reasonCodes);
  });
});

describe('Kernel characterization: traceability', () => {
  it('every completed evaluation identifies request, actor, policies, authority, approval, evidence, outcome and reason codes', async () => {
    const { kernel } = buildKernelParityWorld();
    const request = toKernelRequest(buildDraftClosureEmailGuardInput());

    const result = await kernel.evaluate(request);

    assert.equal(result.requestId, request.requestId);
    assert.ok(result.decisionId.length > 0);
    assert.ok(result.reasonCodes.length > 0);
    assert.ok(result.recognition.performed);
    assert.ok(result.authority.performed);
    assert.ok(Array.isArray(result.policies) && result.policies.length > 0);
    assert.ok(result.approval);
    assert.ok(Array.isArray(result.evidence));
    assert.equal(result.trace.decisionId, result.decisionId);
    assert.ok(result.trace.steps.length > 0);

    for (const [index, step] of result.trace.steps.entries()) {
      assert.equal(step.sequence, index + 1, 'trace steps are in strict sequence order');
    }
  });

  it('trace steps run in the documented order: recognition, authority, approval, then the enforcement policy chain', async () => {
    const { kernel } = buildKernelParityWorld();
    const result = await kernel.evaluate(toKernelRequest(buildDraftClosureEmailGuardInput()));

    const operators = result.trace.steps.map((step) => step.operator);
    assert.deepEqual(operators.slice(0, 3), ['recognition', 'authority', 'approval']);
    assert.ok(operators.includes('recognition_required'));
    assert.ok(operators.includes('post_execution_record'));
  });
});
