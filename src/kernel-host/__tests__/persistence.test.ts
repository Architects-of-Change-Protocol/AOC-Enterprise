import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryGovernanceStore } from '../persistence/in-memory-governance-store.js';
import { createSqliteGovernanceStore } from '../persistence/sqlite-governance-store.js';
import type { GovernanceStore } from '../persistence/governance-store.js';
import { createAocKernel } from '../../kernel/index.js';
import { buildAllowedRequestBody, buildTestKernelProviders } from './support.js';
import { toKernelEvaluationRequest, toKernelEvaluationOptions } from '../api/governance-evaluate-contract.js';

async function evaluateOnce(requestId: string, overrides: Record<string, unknown> = {}) {
  const providers = buildTestKernelProviders();
  const kernel = createAocKernel({ recognitionProvider: providers.recognitionProvider, clock: providers.clock, idGenerator: providers.idGenerator });
  const body = buildAllowedRequestBody({ requestId, ...overrides });
  const request = toKernelEvaluationRequest(body, providers.clock, providers.idGenerator);
  const result = await kernel.evaluate(request, toKernelEvaluationOptions(body, 'full'));
  return { request, result };
}

const STORE_VARIANTS: readonly { readonly name: string; readonly build: () => Promise<GovernanceStore> }[] = [
  { name: 'in-memory', build: async () => createInMemoryGovernanceStore() },
  { name: 'sqlite (:memory:)', build: () => createSqliteGovernanceStore(':memory:') },
];

for (const variant of STORE_VARIANTS) {
  describe(`GovernanceStore (${variant.name})`, () => {
    it('persists a request/evaluation/trace as one unit and makes each independently retrievable', async () => {
      const store = await variant.build();
      const { request, result } = await evaluateOnce('req-persist-1');

      const persisted = await store.persistEvaluation({ request, result, receivedAt: request.requestedAt });
      assert.equal(persisted.outcome, 'stored');

      const storedRequest = await store.getRequestById(request.requestId);
      assert.equal(storedRequest?.actorId, request.actor.id);
      assert.equal(storedRequest?.actionType, request.action.type);

      const storedEvaluation = await store.getEvaluationByRequestId(request.requestId);
      assert.equal(storedEvaluation?.decisionId, result.decisionId);
      assert.equal(storedEvaluation?.status, result.status);
      assert.deepEqual(storedEvaluation?.reasonCodes, result.reasonCodes);

      const byDecisionId = await store.getEvaluationByDecisionId(result.decisionId);
      assert.equal(byDecisionId?.requestId, request.requestId);

      const trace = await store.getTraceByDecisionId(result.decisionId);
      assert.deepEqual(trace?.trace, result.trace);

      await store.close();
    });

    it('treats a byte-identical resubmission of the same requestId as an idempotent replay, writing nothing new', async () => {
      const store = await variant.build();
      const { request, result } = await evaluateOnce('req-idempotent-1');

      const first = await store.persistEvaluation({ request, result, receivedAt: request.requestedAt });
      const second = await store.persistEvaluation({ request, result, receivedAt: request.requestedAt });

      assert.equal(first.outcome, 'stored');
      assert.equal(second.outcome, 'idempotent_replay');
      assert.equal(second.evaluation.decisionId, first.evaluation.decisionId);

      await store.close();
    });

    it('flags a different payload reusing the same requestId as a conflict, writing nothing new', async () => {
      const store = await variant.build();
      const { request: requestA, result: resultA } = await evaluateOnce('req-conflict-1');
      const { request: requestB, result: resultB } = await evaluateOnce('req-conflict-1', { action: { type: 'summarize_project_status', resourceScope: 'project:hmp-14665' } });

      const first = await store.persistEvaluation({ request: requestA, result: resultA, receivedAt: requestA.requestedAt });
      const second = await store.persistEvaluation({ request: requestB, result: resultB, receivedAt: requestB.requestedAt });

      assert.equal(first.outcome, 'stored');
      assert.equal(second.outcome, 'conflict');
      assert.equal(second.evaluation.decisionId, first.evaluation.decisionId, 'the original evaluation must remain the system of record, unmodified');

      const stillOriginal = await store.getEvaluationByRequestId('req-conflict-1');
      assert.equal(stillOriginal?.decisionId, resultA.decisionId);

      await store.close();
    });

    it('appends and filters RuntimeEvents by requestId and correlationId', async () => {
      const store = await variant.build();
      await store.appendRuntimeEvent({ eventId: 'evt-1', eventType: 'GovernanceEvaluationRequested', requestId: 'req-a', correlationId: 'corr-a', occurredAt: '2026-01-01T00:00:00.000Z', payload: {} });
      await store.appendRuntimeEvent({ eventId: 'evt-2', eventType: 'GovernanceEvaluationRequested', requestId: 'req-b', correlationId: 'corr-b', occurredAt: '2026-01-01T00:00:01.000Z', payload: {} });

      const byRequest = await store.listRuntimeEvents({ requestId: 'req-a' });
      assert.equal(byRequest.length, 1);
      assert.equal(byRequest[0]?.eventId, 'evt-1');

      const byCorrelation = await store.listRuntimeEvents({ correlationId: 'corr-b' });
      assert.equal(byCorrelation.length, 1);
      assert.equal(byCorrelation[0]?.eventId, 'evt-2');

      const all = await store.listRuntimeEvents();
      assert.equal(all.length, 2);

      await store.close();
    });

    it('records and retrieves the latest RuntimeVersion', async () => {
      const store = await variant.build();
      await store.recordRuntimeVersion({ bootId: 'boot-1', runtimeVersion: '1.0.0', kernelVersion: '1.0.0', recordedAt: '2026-01-01T00:00:00.000Z' });
      await store.recordRuntimeVersion({ bootId: 'boot-2', runtimeVersion: '1.0.1', kernelVersion: '1.0.0', recordedAt: '2026-01-01T00:00:01.000Z' });

      const latest = await store.getLatestRuntimeVersion();
      assert.equal(latest?.bootId, 'boot-2');

      await store.close();
    });

    it('reports connectivity true while open', async () => {
      const store = await variant.build();
      assert.equal(await store.checkConnectivity(), true);
      await store.close();
    });
  });
}

describe('SQLite GovernanceStore rollback', () => {
  it('rolls back the entire transaction (request + evaluation + trace) if any insert in it fails', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const { request, result } = await evaluateOnce('req-rollback-1');

    // Pre-seed a row under a different (internally-consistent) requestId/decisionId pair, then
    // force a second, otherwise-valid transaction to collide on that same decisionId --
    // tripping the GovernanceEvaluations PRIMARY KEY constraint mid-transaction.
    const collider = await evaluateOnce('req-rollback-collider');
    await store.persistEvaluation({ request: collider.request, result: collider.result, receivedAt: collider.request.requestedAt });

    const collidingResult = { ...result, decisionId: collider.result.decisionId };
    await assert.rejects(() => store.persistEvaluation({ request, result: collidingResult, receivedAt: request.requestedAt }));

    const requestRow = await store.getRequestById(request.requestId);
    assert.equal(requestRow, undefined, 'the failed transaction must not have left a partial GovernanceRequests row');

    await store.close();
  });
});
