import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
import type { AppendGovernanceEvaluationInput, GovernanceStoreAccessContext } from '../governance-store/contracts.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { GovernanceStoreError } from '../governance-store/errors.js';
import { createInMemoryGovernanceStore, type CreateGovernanceStoreOptions } from '../governance-store/in-memory-governance-store.js';
import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import { toKernelEvaluationResult } from '../governance-store/store-common.js';

const SYSTEM: GovernanceStoreAccessContext = { system: true };

/** Deterministic clock/id sources so both providers produce comparable records. */
function deterministicOptions(): CreateGovernanceStoreOptions {
  let tick = 0;
  let id = 0;
  return {
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, (tick += 1))).toISOString(),
    nextId: (prefix: string) => `${prefix}-${(id += 1)}`,
  };
}

function buildRequest(requestId: string, overrides: Partial<KernelEvaluationRequest> = {}): KernelEvaluationRequest {
  return {
    requestId,
    actor: { id: 'actor-pmfreak', trustDomainId: 'td-datasys', type: 'agent' },
    action: { type: 'draft_closure_email', resourceScope: 'project:hmp', domain: 'communication' },
    organization: { id: 'org-datasys' },
    target: { id: 'target-1', type: 'email' },
    context: { capabilityTokenId: 'cap-1' },
    requestedAt: '2026-01-01T00:00:00.000Z',
    correlationId: `corr-${requestId}`,
    ...overrides,
  };
}

function buildResult(requestId: string, decisionId: string, overrides: Partial<KernelEvaluationResult> = {}): KernelEvaluationResult {
  return {
    requestId,
    decisionId,
    status: 'allowed',
    reasonCodes: ['RECOGNITION_VERIFIED', 'ACTION_ALLOWED', 'ACTION_ALLOWED'],
    summary: 'Allowed.',
    recognition: { performed: true, recognized: true },
    authority: { performed: false },
    policies: [],
    approval: { performed: false, status: 'not_applicable' },
    evidence: [],
    trace: {
      steps: [
        { sequence: 1, operator: 'recognition', status: 'passed', reasonCodes: ['RECOGNITION_VERIFIED'], startedAt: '2026-01-01T00:00:00.100Z' },
        { sequence: 2, operator: 'policy_chain', status: 'passed', reasonCodes: ['ACTION_ALLOWED'], metadata: { policyCount: 0 } },
      ],
      decisionId,
      kernelVersion: '1.0.0',
    },
    evaluatedAt: '2026-01-01T00:00:00.200Z',
    kernelVersion: '1.0.0',
    correlationId: `corr-${requestId}`,
    ...overrides,
  };
}

function buildInput(requestId: string, decisionId: string, overrides: Partial<AppendGovernanceEvaluationInput> = {}): AppendGovernanceEvaluationInput {
  return {
    request: buildRequest(requestId),
    result: buildResult(requestId, decisionId),
    receivedAt: '2026-01-01T00:00:00.050Z',
    enterpriseContext: {
      enterpriseVersion: '1.0.0',
      lifecycleState: 'ready',
      modules: [{ id: 'aoc.kernel', version: '1.0.0', state: 'ready', required: true, dependencies: [], capabilities: [] }],
      providers: [{ providerType: 'recognition', ready: true }],
      environment: 'test',
    },
    events: [
      { eventId: `evt-req-${requestId}`, type: 'GovernanceEvaluationRequested', occurredAt: '2026-01-01T00:00:00.050Z', requestId, correlationId: `corr-${requestId}` },
      {
        eventId: `evt-done-${requestId}`,
        type: 'GovernanceEvaluationCompleted',
        occurredAt: '2026-01-01T00:00:00.200Z',
        requestId,
        decisionId,
        status: 'allowed',
        reasonCodes: ['RECOGNITION_VERIFIED', 'ACTION_ALLOWED', 'ACTION_ALLOWED'],
        kernelVersion: '1.0.0',
        correlationId: `corr-${requestId}`,
      },
    ],
    accessContext: SYSTEM,
    ...overrides,
  };
}

async function assertRejectsWithCode(promise: Promise<unknown>, code: string, message?: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof GovernanceStoreError, `expected GovernanceStoreError, got ${String(error)}`);
    assert.equal(error.code, code, message ?? `expected ${code}`);
    return true;
  });
}

const VARIANTS: readonly { readonly name: string; readonly build: (options?: CreateGovernanceStoreOptions) => Promise<GovernanceStore> }[] = [
  { name: 'in-memory', build: async (options) => createInMemoryGovernanceStore(options ?? deterministicOptions()) },
  { name: 'sqlite (:memory:)', build: (options) => createSqliteGovernanceStore(':memory:', options ?? deterministicOptions()) },
];

for (const variant of VARIANTS) {
  describe(`Governance Store v1 contract (${variant.name})`, () => {
    // -- append semantics ----------------------------------------------------

    it('appends one complete aggregate: request, evaluation, ordered trace, ordered reasons, events, metadata, integrity', async () => {
      const store = await variant.build();
      const appended = await store.appendEvaluation(buildInput('req-a1', 'dec-a1'));
      assert.equal(appended.created, true);
      assert.equal(appended.idempotentReplay, false);
      assert.match(appended.aggregateDigest, /^sha256:/);

      const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
      assert.ok(record);
      assert.equal(record.request.requestId, 'req-a1');
      assert.equal(record.request.organizationId, 'org-datasys');
      assert.equal(record.request.requestContract, 'aoc.governance-request-record.v1');
      assert.equal(record.evaluation.decisionId, 'dec-a1');
      assert.equal(record.evaluation.enterpriseVersion, '1.0.0');
      assert.deepEqual(record.trace.map((step) => step.sequence), [1, 2]);
      assert.deepEqual(record.reasons.map((reason) => reason.reasonCode), ['RECOGNITION_VERIFIED', 'ACTION_ALLOWED', 'ACTION_ALLOWED']);
      assert.deepEqual(record.reasons.map((reason) => reason.sequence), [1, 2, 3]);
      assert.equal(record.events.length, 2);
      assert.equal(record.events[1]?.causationId, record.events[0]?.eventId, 'the Requested event is the causation source of the completion event');
      assert.equal(record.metadata.lifecycleState, 'ready');
      assert.equal(record.metadata.schemaVersion, 'aoc.governance-store.schema.v1');
      assert.equal(record.integrity.chainPosition, 1);
      assert.equal(record.integrity.previousAggregateDigest, undefined);
      await store.close();
    });

    it('links successive aggregates in a store-scoped hash chain', async () => {
      const store = await variant.build();
      const first = await store.appendEvaluation(buildInput('req-c1', 'dec-c1'));
      const second = await store.appendEvaluation(buildInput('req-c2', 'dec-c2'));
      const secondRecord = await store.getByEvaluationId(SYSTEM, second.evaluationId);
      assert.equal(secondRecord?.integrity.chainPosition, 2);
      assert.equal(secondRecord?.integrity.previousAggregateDigest, first.aggregateDigest);
      await store.close();
    });

    it('rejects a mismatched request/result pair as a validation error, storing nothing', async () => {
      const store = await variant.build();
      await assertRejectsWithCode(
        store.appendEvaluation(buildInput('req-v1', 'dec-v1', { result: buildResult('req-OTHER', 'dec-v1') })),
        'GOVERNANCE_STORE_VALIDATION_ERROR',
      );
      assert.equal(await store.getByRequestId(SYSTEM, 'req-v1'), null);
      await store.close();
    });

    it('rejects a duplicate decisionId atomically — no orphaned request row survives the rollback', async () => {
      const store = await variant.build();
      await store.appendEvaluation(buildInput('req-d1', 'dec-dup'));
      await assertRejectsWithCode(store.appendEvaluation(buildInput('req-d2', 'dec-dup')), 'GOVERNANCE_STORE_TRANSACTION_FAILED');
      assert.equal(await store.getByRequestId(SYSTEM, 'req-d2'), null, 'the failed transaction must leave no partial aggregate');
      await store.close();
    });

    it('has no public update or delete surface', async () => {
      const store = await variant.build();
      const methodNames = Object.keys(store);
      for (const name of methodNames) {
        assert.ok(!/^(update|delete|remove|purge)/i.test(name), `forbidden mutating method exposed: ${name}`);
      }
      await store.close();
    });

    // -- idempotency ---------------------------------------------------------

    it('replays a byte-identical requestId resubmission without writing anything new', async () => {
      const store = await variant.build();
      const first = await store.appendEvaluation(buildInput('req-i1', 'dec-i1'));
      const replay = await store.appendEvaluation(buildInput('req-i1', 'dec-i1-different-but-ignored'));
      assert.equal(replay.idempotentReplay, true);
      assert.equal(replay.created, false);
      assert.equal(replay.evaluationId, first.evaluationId);
      assert.equal(replay.existingRecord?.evaluation.decisionId, 'dec-i1');
      await store.close();
    });

    it('flags a different payload reusing the same requestId as a request-id conflict, preserving the original', async () => {
      const store = await variant.build();
      await store.appendEvaluation(buildInput('req-i2', 'dec-i2'));
      const conflicting = buildInput('req-i2', 'dec-i2b', { request: buildRequest('req-i2', { context: { capabilityTokenId: 'cap-OTHER' } }) });
      await assertRejectsWithCode(store.appendEvaluation(conflicting), 'GOVERNANCE_IDEMPOTENCY_CONFLICT');
      const stillOriginal = await store.getByRequestId(SYSTEM, 'req-i2');
      assert.equal(stillOriginal?.evaluation.decisionId, 'dec-i2');
      await store.close();
    });

    it('honors a caller idempotency key: same key + same request replays; same key + different request conflicts', async () => {
      const store = await variant.build();
      const idempotency = { idempotencyKey: 'key-1', scope: 'org:org-datasys' };
      const first = await store.appendEvaluation(buildInput('req-k1', 'dec-k1', { idempotency }));
      const replay = await store.appendEvaluation(buildInput('req-k1', 'dec-k1', { idempotency }));
      assert.equal(replay.idempotentReplay, true);
      assert.equal(replay.evaluationId, first.evaluationId);

      await assertRejectsWithCode(store.appendEvaluation(buildInput('req-k2', 'dec-k2', { idempotency })), 'GOVERNANCE_IDEMPOTENCY_CONFLICT');
      await store.close();
    });

    it('scopes idempotency keys per tenant — the same key in another organization scope is independent', async () => {
      const store = await variant.build();
      await store.appendEvaluation(buildInput('req-t1', 'dec-t1', { idempotency: { idempotencyKey: 'shared-key', scope: 'org:org-datasys' } }));
      const other = await store.appendEvaluation(
        buildInput('req-t2', 'dec-t2', {
          request: buildRequest('req-t2', { organization: { id: 'org-other' } }),
          idempotency: { idempotencyKey: 'shared-key', scope: 'org:org-other' },
        }),
      );
      assert.equal(other.created, true, 'a different tenant scope must not collide on the same key');
      await store.close();
    });

    it('resolves a concurrent burst for the same request to exactly one committed aggregate', async () => {
      const store = await variant.build();
      const input = buildInput('req-burst', 'dec-burst');
      const results = await Promise.all(Array.from({ length: 10 }, () => store.appendEvaluation(input)));
      const created = results.filter((result) => result.created);
      assert.equal(created.length, 1);
      const evaluationIds = new Set(results.map((result) => result.evaluationId));
      assert.equal(evaluationIds.size, 1);
      await store.close();
    });

    it('resolves idempotency before evaluation via the advisory probe', async () => {
      const store = await variant.build();
      const appended = await store.appendEvaluation(buildInput('req-p1', 'dec-p1'));
      const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
      assert.ok(record);

      const replayProbe = await store.resolveIdempotency(SYSTEM, { requestId: 'req-p1', payloadDigest: record.request.payloadDigest });
      assert.equal(replayProbe.kind, 'replay');

      const conflictProbe = await store.resolveIdempotency(SYSTEM, { requestId: 'req-p1', payloadDigest: 'sha256:' + '0'.repeat(64) });
      assert.equal(conflictProbe.kind, 'conflict');

      const freshProbe = await store.resolveIdempotency(SYSTEM, { requestId: 'req-unseen', payloadDigest: record.request.payloadDigest });
      assert.equal(freshProbe.kind, 'new');
      await store.close();
    });

    // -- reconstruction and verification --------------------------------------

    it('reconstructs the complete aggregate, and the stored projection rehydrates the original Kernel result shape', async () => {
      const store = await variant.build();
      const appended = await store.appendEvaluation(buildInput('req-r1', 'dec-r1'));
      const loaded = await store.reconstruct(SYSTEM, appended.evaluationId);
      assert.equal(loaded.status, 'complete');
      assert.ok(loaded.record);
      assert.deepEqual(loaded.missingComponents, []);

      const rehydrated = toKernelEvaluationResult(loaded.record);
      assert.equal(rehydrated.decisionId, 'dec-r1');
      assert.equal(rehydrated.status, 'allowed');
      assert.deepEqual(rehydrated.reasonCodes, ['RECOGNITION_VERIFIED', 'ACTION_ALLOWED', 'ACTION_ALLOWED']);
      assert.deepEqual(rehydrated.trace.steps.map((step) => step.operator), ['recognition', 'policy_chain']);
      await store.close();
    });

    it('reports GOVERNANCE_RECORD_NOT_FOUND for reconstruction/verification of an unknown evaluation', async () => {
      const store = await variant.build();
      await assertRejectsWithCode(store.reconstruct(SYSTEM, 'gov-evaluation-unknown'), 'GOVERNANCE_RECORD_NOT_FOUND');
      await assertRejectsWithCode(store.verify(SYSTEM, 'gov-evaluation-unknown'), 'GOVERNANCE_RECORD_NOT_FOUND');
      await store.close();
    });

    it('verifies an untampered record: every check true, including chain linkage on later aggregates', async () => {
      const store = await variant.build();
      await store.appendEvaluation(buildInput('req-w1', 'dec-w1'));
      const second = await store.appendEvaluation(buildInput('req-w2', 'dec-w2'));
      const verification = await store.verify(SYSTEM, second.evaluationId);
      assert.equal(verification.valid, true);
      assert.deepEqual(verification.failures, []);
      assert.equal(verification.checks.requestDigest, true);
      assert.equal(verification.checks.evaluationDigest, true);
      assert.equal(verification.checks.traceDigest, true);
      assert.equal(verification.checks.eventsDigest, true);
      assert.equal(verification.checks.metadataDigest, true);
      assert.equal(verification.checks.aggregateDigest, true);
      assert.equal(verification.checks.previousDigest, true);
      await store.close();
    });

    // -- references ------------------------------------------------------------

    it('appends extension references and surfaces them on the reconstructed record; duplicates are rejected', async () => {
      const store = await variant.build();
      const appended = await store.appendEvaluation(buildInput('req-f1', 'dec-f1'));
      const reference = {
        referenceId: 'ref-1',
        evaluationId: appended.evaluationId,
        referenceType: 'evidence_bundle' as const,
        externalId: 'bundle-1',
        createdAt: '2026-01-02T00:00:00.000Z',
      };
      await store.appendReference(SYSTEM, reference);
      const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
      assert.equal(record?.references.length, 1);
      assert.equal(record?.references[0]?.externalId, 'bundle-1');

      await assertRejectsWithCode(store.appendReference(SYSTEM, reference), 'GOVERNANCE_STORE_VALIDATION_ERROR');
      await assertRejectsWithCode(store.appendReference(SYSTEM, { ...reference, referenceId: 'ref-2', evaluationId: 'gov-evaluation-unknown' }), 'GOVERNANCE_RECORD_NOT_FOUND');
      await store.close();
    });

    // -- queries ----------------------------------------------------------------

    it('supports every documented filter, combined filters, and time ranges', async () => {
      const store = await variant.build();
      const first = await store.appendEvaluation(buildInput('req-q1', 'dec-q1'));
      await store.appendEvaluation(
        buildInput('req-q2', 'dec-q2', {
          request: buildRequest('req-q2', { actor: { id: 'actor-other', trustDomainId: 'td-datasys' }, organization: { id: 'org-other' }, action: { type: 'send_email', resourceScope: 'p' } }),
          result: buildResult('req-q2', 'dec-q2', { status: 'denied', reasonCodes: ['ACTOR_NOT_RECOGNIZED'], evaluatedAt: '2026-06-01T00:00:00.000Z' }),
        }),
      );

      assert.equal((await store.query(SYSTEM, { requestId: 'req-q1' })).records[0]?.decisionId, 'dec-q1');
      assert.equal((await store.query(SYSTEM, { evaluationId: first.evaluationId })).records.length, 1);
      assert.equal((await store.query(SYSTEM, { decisionId: 'dec-q2' })).records.length, 1);
      assert.equal((await store.query(SYSTEM, { correlationId: 'corr-req-q1' })).records.length, 1);
      assert.equal((await store.query(SYSTEM, { organizationId: 'org-other' })).records.length, 1);
      assert.equal((await store.query(SYSTEM, { actorId: 'actor-other' })).records.length, 1);
      assert.equal((await store.query(SYSTEM, { actionType: 'send_email' })).records.length, 1);
      assert.equal((await store.query(SYSTEM, { status: 'denied' })).records.length, 1);
      assert.equal((await store.query(SYSTEM, { reasonCode: 'ACTOR_NOT_RECOGNIZED' })).records.length, 1);
      assert.equal((await store.query(SYSTEM, { from: '2026-05-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' })).records.length, 1);
      assert.equal((await store.query(SYSTEM, { status: 'denied', actorId: 'actor-other', reasonCode: 'ACTOR_NOT_RECOGNIZED' })).records.length, 1);
      assert.equal((await store.query(SYSTEM, { status: 'denied', actorId: 'actor-pmfreak' })).records.length, 0, 'combined filters are ANDed');
      assert.deepEqual((await store.query(SYSTEM, { requestId: 'req-nothing' })).records, []);
      await store.close();
    });

    it('paginates with a stable opaque cursor in chain order (newest committed first)', async () => {
      const store = await variant.build();
      for (let index = 1; index <= 5; index += 1) {
        await store.appendEvaluation(buildInput(`req-pg${index}`, `dec-pg${index}`));
      }
      const firstPage = await store.query(SYSTEM, { limit: 2 });
      assert.deepEqual(firstPage.records.map((record) => record.decisionId), ['dec-pg5', 'dec-pg4']);
      assert.ok(firstPage.nextCursor);

      // A record appended between pages must not shift the already-issued cursor's window.
      await store.appendEvaluation(buildInput('req-pg6', 'dec-pg6'));

      assert.ok(firstPage.nextCursor !== undefined);
      const secondPage = await store.query(SYSTEM, { limit: 2, cursor: firstPage.nextCursor });
      assert.deepEqual(secondPage.records.map((record) => record.decisionId), ['dec-pg3', 'dec-pg2']);
      assert.ok(secondPage.nextCursor !== undefined);
      const thirdPage = await store.query(SYSTEM, { limit: 2, cursor: secondPage.nextCursor });
      assert.deepEqual(thirdPage.records.map((record) => record.decisionId), ['dec-pg1']);
      assert.equal(thirdPage.nextCursor, undefined);

      await assertRejectsWithCode(store.query(SYSTEM, { cursor: 'not-a-cursor' }), 'GOVERNANCE_STORE_VALIDATION_ERROR');
      await assertRejectsWithCode(store.query(SYSTEM, { limit: 0 }), 'GOVERNANCE_STORE_VALIDATION_ERROR');
      await store.close();
    });

    // -- tenant isolation --------------------------------------------------------

    it('enforces tenant isolation on every read: scope required, own-organization only, no cross-tenant leakage', async () => {
      const store = await variant.build();
      const appended = await store.appendEvaluation(buildInput('req-s1', 'dec-s1'));

      await assertRejectsWithCode(store.query({ system: false }, {}), 'GOVERNANCE_TENANT_SCOPE_REQUIRED');
      await assertRejectsWithCode(store.getByRequestId({ system: false }, 'req-s1'), 'GOVERNANCE_TENANT_SCOPE_REQUIRED');
      await assertRejectsWithCode(store.query({ system: false, organizationId: 'org-a' }, { organizationId: 'org-b' }), 'GOVERNANCE_ACCESS_SCOPE_VIOLATION');

      const own = await store.getByEvaluationId({ system: false, organizationId: 'org-datasys' }, appended.evaluationId);
      assert.ok(own, 'the owning organization sees its record');
      const foreign = await store.getByEvaluationId({ system: false, organizationId: 'org-other' }, appended.evaluationId);
      assert.equal(foreign, null, 'another organization must not even learn the record exists');
      const foreignQuery = await store.query({ system: false, organizationId: 'org-other' }, {});
      assert.deepEqual(foreignQuery.records, []);
      await store.close();
    });

    // -- size limits ---------------------------------------------------------------

    it('enforces the configured size limits with specific error codes', async () => {
      const tiny = await variant.build({ ...deterministicOptions(), limits: { maxRequestPayloadBytes: 200, maxResultPayloadBytes: 100_000, maxEventPayloadBytes: 100_000, maxTraceSteps: 1 } });
      await assertRejectsWithCode(tiny.appendEvaluation(buildInput('req-big', 'dec-big')), 'GOVERNANCE_RECORD_TOO_LARGE');
      await tiny.close();

      const fewSteps = await variant.build({ ...deterministicOptions(), limits: { maxRequestPayloadBytes: 100_000, maxResultPayloadBytes: 100_000, maxEventPayloadBytes: 100_000, maxTraceSteps: 1 } });
      await assertRejectsWithCode(fewSteps.appendEvaluation(buildInput('req-steps', 'dec-steps')), 'GOVERNANCE_TRACE_LIMIT_EXCEEDED');
      await fewSteps.close();

      const smallEvents = await variant.build({ ...deterministicOptions(), limits: { maxRequestPayloadBytes: 100_000, maxResultPayloadBytes: 100_000, maxEventPayloadBytes: 40, maxTraceSteps: 10 } });
      await assertRejectsWithCode(smallEvents.appendEvaluation(buildInput('req-evt', 'dec-evt')), 'GOVERNANCE_EVENT_PAYLOAD_TOO_LARGE');
      await smallEvents.close();
    });

    // -- redaction -------------------------------------------------------------------

    it('persists the sanitized projection: secrets never reach the stored payload, and the digest covers the sanitized record', async () => {
      const store = await variant.build();
      const appended = await store.appendEvaluation(
        buildInput('req-red', 'dec-red', { request: buildRequest('req-red', { context: { accessToken: 'super-secret', authorization: 'Bearer abc', capabilityTokenId: 'cap-1' } }) }),
      );
      const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
      const serialized = JSON.stringify(record);
      assert.ok(!serialized.includes('super-secret'));
      assert.ok(!serialized.includes('Bearer abc'));
      assert.ok(serialized.includes('cap-1'), 'reference ids survive redaction');
      const verification = await store.verify(SYSTEM, appended.evaluationId);
      assert.equal(verification.valid, true, 'digests attest to the sanitized persisted record');
      await store.close();
    });

    // -- lifecycle events / health -----------------------------------------------------

    it('appends standalone lifecycle events and reports health with schema and migration state', async () => {
      const store = await variant.build();
      await store.appendLifecycleEvent({
        eventId: 'lc-1',
        type: 'EnterpriseReady',
        occurredAt: '2026-01-01T00:00:01.000Z',
        enterpriseVersion: '1.0.0',
        lifecycleCorrelationId: 'lifecycle-boot-1',
      });
      const health = await store.health();
      assert.equal(health.status, 'healthy');
      assert.equal(health.writable, true);
      assert.equal(health.readable, true);
      assert.equal(health.schemaVersion, 'aoc.governance-store.schema.v1');
      await store.close();
    });

    it('refuses use after close', async () => {
      const store = await variant.build();
      await store.close();
      assert.equal(await store.checkConnectivity(), false);
      await assertRejectsWithCode(store.appendEvaluation(buildInput('req-x', 'dec-x')), 'GOVERNANCE_STORE_UNAVAILABLE');
      const health = await store.health();
      assert.equal(health.status, 'unhealthy');
    });
  });
}
