import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocKernel } from '../../kernel/index.js';
import { buildRuntimeHost } from '../dependency-injection/composition-root.js';
import { toKernelEvaluationOptions, toKernelEvaluationRequest } from '../api/governance-evaluate-contract.js';
import { buildAllowedRequestBody, buildDeniedRequestBody, buildTestKernelProviders } from './support.js';

/**
 * Proves the Runtime Host is a transparent host, not a second decision
 * engine: given the same seeded world, the same request, and the same
 * deterministic clock/id sequence, `host.handleGovernanceEvaluate()` must
 * produce byte-identical governance semantics to calling `AocKernel.evaluate()`
 * directly. No Runtime module may manipulate governance semantics.
 */
describe('Runtime Host / Kernel parity', () => {
  it('produces the same decisionId, status, reasonCodes and trace as calling the Kernel directly', async () => {
    const providers = buildTestKernelProviders();
    const directKernel = createAocKernel({ recognitionProvider: providers.recognitionProvider, clock: providers.clock, idGenerator: providers.idGenerator });

    const body = buildAllowedRequestBody({ requestId: 'req-parity-1' });
    const directRequest = toKernelEvaluationRequest(body, providers.clock, providers.idGenerator);
    const directResult = await directKernel.evaluate(directRequest, toKernelEvaluationOptions(body, 'full'));

    // A fresh, identically-seeded world + a fresh, identically-seeded deterministic clock/id
    // sequence, hosted through the Runtime this time.
    const host = await buildRuntimeHost({ kernelProviders: buildTestKernelProviders() });
    const outcome = await host.handleGovernanceEvaluate({ rawBody: body });

    assert.equal(outcome.body.decisionId, directResult.decisionId);
    assert.equal(outcome.body.status, directResult.status);
    assert.deepEqual(outcome.body.reasonCodes, directResult.reasonCodes);
    assert.deepEqual(outcome.body.trace, directResult.trace);
    assert.equal(outcome.body.summary, directResult.summary);

    await host.close();
  });

  it('never calls kernel.enforce() -- evaluate() only, per the mission (no execution, no Passport mutation)', () => {
    // Read the repo-root-relative TypeScript source (not the compiled `dist/` output this test
    // itself runs from) so the assertion holds regardless of build artifacts.
    const orchestrationSource = readFileSync('src/kernel-host/orchestration/evaluate-governance-request.ts', 'utf8');
    assert.ok(orchestrationSource.includes('.evaluate('), 'the orchestrator must call kernel.evaluate()');
    assert.ok(!orchestrationSource.includes('.enforce('), 'the orchestrator must never call kernel.enforce() -- no side effects, no executor');
  });

  it('surfaces a real recognition denial exactly as the Kernel reports it, with a full persisted trace', async () => {
    const host = await buildRuntimeHost({ kernelProviders: buildTestKernelProviders() });
    const outcome = await host.handleGovernanceEvaluate({ rawBody: buildDeniedRequestBody({ requestId: 'req-parity-denied-1' }) });

    assert.equal(outcome.httpStatus, 422);
    assert.equal(outcome.body.status, 'denied');
    assert.equal(outcome.body.trace.steps[0]?.operator, 'recognition');
    assert.equal(outcome.body.trace.steps[0]?.status, 'failed');

    const persistedTrace = await host.store.getTraceByDecisionId(outcome.body.decisionId);
    assert.deepEqual(persistedTrace?.trace, outcome.body.trace);

    await host.close();
  });
});
