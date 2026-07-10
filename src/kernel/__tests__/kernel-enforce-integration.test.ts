import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDraftClosureEmailGuardInput } from '../../features/action-enforcement/fixtures/allowed-action.fixture.js';
import { buildUnknownAgentReadGuardInput } from '../../features/action-enforcement/fixtures/denied-action.fixture.js';
import type { RecognitionVerificationInput, RecognitionVerificationResult } from '../../features/action-enforcement/domain/enforcement-context.js';
import { AocGuard, createAocGuard } from '../../features/action-enforcement/sdk/aoc-guard.js';
import { AocKernel } from '../AocKernel.js';
import { KernelConfigurationError } from '../errors/kernel-errors.js';
import { buildKernelParityWorld, toKernelRequest } from './characterization/support.js';

describe('AocKernel.enforce: one real integration path through the extracted kernel', () => {
  it('invokes the caller-supplied adapter exactly once, and only when evaluation allows it, end to end', async () => {
    const { kernel } = buildKernelParityWorld();
    let executions = 0;

    const allowed = await kernel.enforce(toKernelRequest(buildDraftClosureEmailGuardInput()), () => {
      executions += 1;
      return { sent: true };
    });
    assert.equal(allowed.status, 'allowed');
    assert.equal(allowed.execution.executed, true);
    assert.deepEqual(allowed.execution.value, { sent: true });
    assert.equal(executions, 1);

    const denied = await kernel.enforce(toKernelRequest(buildUnknownAgentReadGuardInput()), () => {
      executions += 1;
      return { sent: true };
    });
    assert.equal(denied.status, 'denied');
    assert.equal(denied.execution.executed, false);
    assert.equal(executions, 1, 'the executor must not run for a denied evaluation');
  });

  it('never mutates the KernelEvaluationRequest across a full evaluate() + enforce() round trip', async () => {
    const { kernel } = buildKernelParityWorld();
    const request = Object.freeze({ ...toKernelRequest(buildDraftClosureEmailGuardInput()), context: Object.freeze({ passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-drafting', evidence: Object.freeze([{ type: 'email_thread', reference: 'thread:HMP-14665' }]) }) });

    await assert.doesNotReject(() => kernel.evaluate(request));
    await assert.doesNotReject(() => kernel.enforce(request, () => 'ok'));
  });
});

describe('AocKernel configuration', () => {
  it('throws KernelConfigurationError when constructed without a recognitionProvider', () => {
    assert.throws(() => new AocKernel({} as never), KernelConfigurationError);
  });
});

describe('AocKernel dependency failure handling', () => {
  it('surfaces an unexpected recognitionProvider failure as status: indeterminate rather than throwing', async () => {
    const throwingProvider = {
      verifyAction(_input: RecognitionVerificationInput): RecognitionVerificationResult {
        throw new Error('simulated upstream recognition outage');
      },
    };
    const kernel = new AocKernel({ recognitionProvider: throwingProvider });

    const result = await kernel.evaluate(toKernelRequest(buildDraftClosureEmailGuardInput()));
    assert.equal(result.status, 'indeterminate');
    assert.ok(result.reasonCodes.includes('KERNEL_INDETERMINATE'));

    const enforcement = await kernel.enforce(toKernelRequest(buildDraftClosureEmailGuardInput()), () => 'unreached');
    assert.equal(enforcement.status, 'indeterminate');
    assert.equal(enforcement.execution.executed, false);
  });
});

describe('Compatibility: existing AocGuard consumers remain fully functional', () => {
  it('AocGuard/createAocGuard are untouched and still work exactly as before the kernel extraction', async () => {
    const { fixture } = buildKernelParityWorld();
    const guard: AocGuard = createAocGuard(fixture.enforcementRuntime);
    let ran = false;
    const outcome = await guard.enforce(buildDraftClosureEmailGuardInput(), () => ((ran = true), 'ok'));
    assert.equal(outcome.decision.type, 'execute_allowed');
    assert.equal(ran, true);
  });
});
