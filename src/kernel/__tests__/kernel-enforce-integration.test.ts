import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDraftClosureEmailGuardInput } from '../../features/action-enforcement/fixtures/allowed-action.fixture.js';
import { buildUnknownAgentReadGuardInput } from '../../features/action-enforcement/fixtures/denied-action.fixture.js';
import type { EnforcementAdapter } from '../../features/action-enforcement/domain/enforcement-adapter.js';
import type { RecognitionVerificationInput, RecognitionVerificationResult } from '../../features/action-enforcement/domain/enforcement-context.js';
import { AocGuard, createAocGuard } from '../../features/action-enforcement/sdk/aoc-guard.js';
import { bridgeRecognitionRuntime } from '../../features/action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { AocKernel } from '../AocKernel.js';
import { KernelConfigurationError } from '../errors/kernel-errors.js';
import { assertThrowsInstance } from './assert-helpers.js';
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

    await kernel.evaluate(request);
    await kernel.enforce(request, () => 'ok');
  });

  it('does not raise a false mutation invariant for a context containing a Date, NaN, or BigInt', async () => {
    const { kernel } = buildKernelParityWorld();
    const request = toKernelRequest(buildDraftClosureEmailGuardInput({
      metadata: {
        passportId: 'passport-pmfreak',
        capabilityTokenId: 'cap-pmfreak-drafting',
        evidence: [{ type: 'email_thread', reference: 'thread:HMP-14665' }],
        when: new Date('2026-01-01T00:00:00.000Z'),
        weight: Number.NaN,
        volume: 10n,
      },
    }));

    // Would previously throw KernelInvariantError (JSON round-trip coerced Date -> string,
    // NaN !== NaN under strict equality) or TypeError (JSON.stringify cannot serialize BigInt).
    const result = await kernel.evaluate(request);
    assert.equal(result.status, 'allowed');
  });
});

describe('AocKernel configuration', () => {
  it('throws KernelConfigurationError when constructed without a recognitionProvider', () => {
    assertThrowsInstance(() => new AocKernel({} as never), KernelConfigurationError);
  });
});

describe('AocKernel adapter registration', () => {
  const DENYING_ADAPTER: EnforcementAdapter = {
    id: 'adapter-email-outbound',
    type: 'api_handler',
    name: 'Outbound email adapter',
    deniedActions: ['draft_closure_email'],
    requiresIdempotencyKey: false,
  };

  it('without a registered adapter, an adapter-targeted request passes with NO_ADAPTER_REGISTERED (nothing to check)', async () => {
    const { fixture } = buildKernelParityWorld();
    const kernel = new AocKernel({ recognitionProvider: bridgeRecognitionRuntime(fixture.recognitionRuntime) });

    const result = await kernel.evaluate(toKernelRequest(buildDraftClosureEmailGuardInput({ adapterId: DENYING_ADAPTER.id })));
    assert.equal(result.status, 'allowed');
  });

  it('adapters registered via AocKernelOptions.adapters are enforced by AdapterPermissionPolicy', async () => {
    const { fixture } = buildKernelParityWorld();
    const kernel = new AocKernel({ recognitionProvider: bridgeRecognitionRuntime(fixture.recognitionRuntime), adapters: [DENYING_ADAPTER] });

    const result = await kernel.evaluate(toKernelRequest(buildDraftClosureEmailGuardInput({ adapterId: DENYING_ADAPTER.id })));
    assert.equal(result.status, 'denied');
    assert.ok(result.policies.some((p) => p.policyId === 'adapter_permission' && !p.passed));
  });

  it('registerAdapter() registers an adapter after construction', async () => {
    const { fixture } = buildKernelParityWorld();
    const kernel = new AocKernel({ recognitionProvider: bridgeRecognitionRuntime(fixture.recognitionRuntime) });
    kernel.registerAdapter(DENYING_ADAPTER);

    const result = await kernel.evaluate(toKernelRequest(buildDraftClosureEmailGuardInput({ adapterId: DENYING_ADAPTER.id })));
    assert.equal(result.status, 'denied');
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
    assert.equal(result.trace.decisionId, result.decisionId, 'the trace must correlate to the same generated decisionId, not a hardcoded placeholder');

    const enforcement = await kernel.enforce(toKernelRequest(buildDraftClosureEmailGuardInput()), () => 'unreached');
    assert.equal(enforcement.status, 'indeterminate');
    assert.equal(enforcement.execution.executed, false);
    assert.equal(enforcement.trace.decisionId, enforcement.decisionId);
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
