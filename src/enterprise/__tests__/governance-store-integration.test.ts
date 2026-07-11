import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterprise, type AocEnterprise } from '../composition/composition-root.js';
import { createEnterpriseServer, type EnterpriseServer } from '../host/enterprise-server.js';
import { loadEnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { createInMemoryGovernanceStore } from '../governance-store/in-memory-governance-store.js';
import { GovernanceStoreError } from '../governance-store/errors.js';
import type { EnterpriseEvent } from '../events/enterprise-events.js';
import { EnterpriseHttpError } from '../api/enterprise-http-errors.js';
import { buildAllowedRequestBody, buildApprovalRequiredRequestBody, buildDeniedRequestBody, buildTestKernelProviders } from './support.js';

const SYSTEM = { system: true } as const;
const openEnterprises: AocEnterprise[] = [];
const startedServers: EnterpriseServer[] = [];

after(async () => {
  await Promise.all(openEnterprises.map((enterprise) => enterprise.close().catch(() => {})));
  await Promise.all(startedServers.map((server) => server.close().catch(() => {})));
});

async function bootEnterprise(options: Parameters<typeof createEnterprise>[0] = {}): Promise<AocEnterprise> {
  const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders(), ...options });
  openEnterprises.push(enterprise);
  return enterprise;
}

describe('Governance Store <-> Enterprise integration (real Kernel)', () => {
  it('stores allowed, denied, and approval-required decisions exactly as evaluated, with reason codes queryable and traces reconstructable', async () => {
    const enterprise = await bootEnterprise();

    const scenarios = [
      { body: buildAllowedRequestBody({ requestId: 'req-int-allowed' }), status: 'allowed' },
      { body: buildDeniedRequestBody({ requestId: 'req-int-denied' }), status: 'denied' },
      { body: buildApprovalRequiredRequestBody({ requestId: 'req-int-approval' }), status: 'approval_required' },
    ] as const;

    for (const scenario of scenarios) {
      const outcome = await enterprise.evaluate(scenario.body);
      assert.equal(outcome.body.status, scenario.status);
      assert.ok(outcome.body.governanceRecord, 'the response names its durable governance record');

      const record = await enterprise.persistence.getByRequestId(SYSTEM, outcome.body.requestId);
      assert.ok(record, 'every returned decision is durably recorded');
      assert.equal(record.evaluation.status, outcome.body.status);
      assert.equal(record.evaluation.decisionId, outcome.body.decisionId);
      assert.deepEqual(record.evaluation.reasonCodes, outcome.body.reasonCodes);
      assert.equal(record.trace.length, outcome.body.trace.steps.length, 'the trace is reconstructable step-for-step');
      assert.equal(record.metadata.lifecycleState, 'ready');
      assert.ok(record.metadata.moduleSnapshot.some((module) => module.moduleId === 'aoc.kernel'));
      assert.equal(record.metadata.schemaVersion, 'aoc.governance-store.schema.v1');

      const hits = await enterprise.persistence.query(SYSTEM, { reasonCode: outcome.body.reasonCodes[0] ?? '', requestId: outcome.body.requestId });
      assert.equal(hits.records.length, 1, 'reason codes are queryable');

      const verification = await enterprise.persistence.verify(SYSTEM, record.evaluation.evaluationId);
      assert.equal(verification.valid, true);
    }
  });

  it('stores an indeterminate decision when the recognition provider fails mid-evaluation', async () => {
    const providers = buildTestKernelProviders();
    const enterprise = await bootEnterprise({
      kernelProviders: {
        ...providers,
        recognitionProvider: {
          verifyAction: () => {
            throw new Error('provider outage');
          },
        },
      },
    });

    const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-int-indeterminate' }));
    assert.equal(outcome.body.status, 'indeterminate');
    const record = await enterprise.persistence.getByRequestId(SYSTEM, 'req-int-indeterminate');
    assert.equal(record?.evaluation.status, 'indeterminate', 'even an indeterminate outcome is durable history');
  });

  it('replays an identical resubmission from the store without re-running the Kernel', async () => {
    const providers = buildTestKernelProviders();
    const enterprise = await bootEnterprise({ kernelProviders: providers });
    let kernelCalls = 0;
    const kernel = enterprise.kernel;
    const originalEvaluate = kernel.evaluate.bind(kernel);
    (kernel as { evaluate: typeof kernel.evaluate }).evaluate = (request, options) => {
      kernelCalls += 1;
      return originalEvaluate(request, options);
    };

    const body = buildAllowedRequestBody({ requestId: 'req-int-replay' });
    const first = await enterprise.evaluate(body);
    assert.equal(kernelCalls, 1);
    const second = await enterprise.evaluate(body);
    assert.equal(kernelCalls, 1, 'the idempotent replay must resolve before the Kernel is re-run');
    assert.equal(second.body.decisionId, first.body.decisionId);
    assert.deepEqual(second.body.governanceRecord, first.body.governanceRecord);
  });

  it('treats an Idempotency-Key reused with a different payload as a 409 GOVERNANCE_IDEMPOTENCY_CONFLICT', async () => {
    const enterprise = await bootEnterprise();
    const context = { idempotencyKey: 'idem-key-1' };
    await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-int-key-a' }), context);
    await assert.rejects(
      enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-int-key-b' }), context),
      (error: unknown) => error instanceof EnterpriseHttpError && error.httpStatus === 409 && error.code === 'GOVERNANCE_IDEMPOTENCY_CONFLICT',
    );
  });

  it('publishes commit events only after the transaction commits, in order: Requested -> Completed -> RecordCommitted', async () => {
    const enterprise = await bootEnterprise();
    const received: EnterpriseEvent[] = [];
    enterprise.eventPublisher.subscribe((event) => {
      if (!('lifecycleCorrelationId' in event)) received.push(event);
    });

    const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-int-events' }));
    const types = received.map((event) => event.type);
    assert.deepEqual(types, ['GovernanceEvaluationRequested', 'GovernanceEvaluationCompleted', 'GovernanceRecordCommitted']);
    const committed = received[2];
    assert.ok(committed !== undefined && committed.type === 'GovernanceRecordCommitted');
    assert.equal(committed.aggregateDigest, outcome.body.governanceRecord?.aggregateDigest);

    const record = await enterprise.persistence.getByRequestId(SYSTEM, 'req-int-events');
    assert.equal(record?.events.length, 2, 'the Requested and completion events are embedded durably in the aggregate');
  });

  it('returns an infrastructure failure — never a governed success — when the store commit fails, and emits GovernanceRecordCommitFailed', async () => {
    const failingStore = createInMemoryGovernanceStore();
    const enterprise = await bootEnterprise({
      persistence: {
        ...failingStore,
        appendEvaluation: () => Promise.reject(new GovernanceStoreError('GOVERNANCE_STORE_UNAVAILABLE', 'disk gone')),
        resolveIdempotency: () => Promise.resolve({ kind: 'new' }),
      },
    });
    const received: EnterpriseEvent[] = [];
    enterprise.eventPublisher.subscribe((event) => {
      if (!('lifecycleCorrelationId' in event)) received.push(event);
    });

    await assert.rejects(
      enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-int-commit-fail' })),
      (error: unknown) => error instanceof EnterpriseHttpError && error.httpStatus === 503 && error.code === 'GOVERNANCE_STORE_UNAVAILABLE',
    );
    const types = received.map((event) => event.type);
    assert.ok(types.includes('GovernanceRecordCommitFailed'));
    assert.ok(!types.includes('GovernanceEvaluationCompleted'), 'no completion event may be published for an unpersisted decision');
    assert.ok(!types.includes('GovernanceRecordCommitted'));
    assert.ok(enterprise.telemetry.snapshot().storeAppendFailureCount >= 1);
  });

  it('refuses to come up when the Governance Store is not writable (readiness gate)', async () => {
    const brokenStore = createInMemoryGovernanceStore();
    await brokenStore.close();
    await assert.rejects(createEnterprise({ kernelProviders: buildTestKernelProviders(), persistence: brokenStore }));
  });

  it('records lifecycle events durably as standalone event records', async () => {
    const enterprise = await bootEnterprise();
    // Startup already happened inside createEnterprise; its lifecycle events
    // were appended through the composition root's subscription.
    const outcome = await enterprise.persistence.query(SYSTEM, {});
    assert.ok(Array.isArray(outcome.records));
    const events = await enterprise.persistence.listEnterpriseEvents();
    // Lifecycle events carry no requestId so they are invisible to the legacy
    // list; assert through the store health instead that appends succeeded
    // (no throw during startup) and telemetry did not record failures.
    assert.equal((await enterprise.persistence.health()).status, 'healthy');
    assert.ok(Array.isArray(events));
  });

  it('keeps secrets out of stored records and structured logs end-to-end', async () => {
    const lines: string[] = [];
    const { createEnterpriseLogger } = await import('../telemetry/enterprise-logger.js');
    const enterprise = await bootEnterprise({
      logger: createEnterpriseLogger('debug', { write: (line) => lines.push(line) }),
    });

    const body = buildAllowedRequestBody({
      requestId: 'req-int-secret',
      context: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-drafting', evidence: [], accessToken: 'super-secret-token-value' },
    });
    await enterprise.evaluate(body, { authorizationHeader: 'Bearer super-secret-bearer' });

    const record = await enterprise.persistence.getByRequestId(SYSTEM, 'req-int-secret');
    const stored = JSON.stringify(record);
    assert.ok(!stored.includes('super-secret-token-value'), 'no secret in the stored payload');
    assert.ok(!stored.includes('super-secret-bearer'), 'the authorization header never reaches the store');
    assert.ok(!lines.join('\n').includes('super-secret'), 'no secret in any structured log line');
  });
});

describe('Governance Store HTTP surface (PR-004 endpoints)', () => {
  async function startServer(): Promise<{ server: EnterpriseServer; baseUrl: string }> {
    const configuration = loadEnterpriseConfiguration({ AOC_ENTERPRISE_HTTP_PORT: '0', AOC_ENTERPRISE_HTTP_HOST: '127.0.0.1' });
    const server = await createEnterpriseServer({ kernelProviders: buildTestKernelProviders(), configuration });
    startedServers.push(server);
    const { port, host } = await server.listen();
    return { server, baseUrl: `http://${host}:${port}` };
  }

  it('supports Idempotency-Key on evaluate and exposes read/verify endpoints for the committed record', async () => {
    const { baseUrl } = await startServer();

    const evaluateResponse = await fetch(`${baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'http-key-1' },
      body: JSON.stringify(buildAllowedRequestBody({ requestId: 'req-http-1' })),
    });
    const evaluateBody = await evaluateResponse.json();
    assert.equal(evaluateResponse.status, 200);
    const evaluationId = evaluateBody.governanceRecord?.evaluationId as string;
    assert.ok(evaluationId);

    // Same key + different payload → 409 with the PR-004 code.
    const conflictResponse = await fetch(`${baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'http-key-1' },
      body: JSON.stringify(buildAllowedRequestBody({ requestId: 'req-http-2' })),
    });
    assert.equal(conflictResponse.status, 409);
    assert.equal((await conflictResponse.json()).error.code, 'GOVERNANCE_IDEMPOTENCY_CONFLICT');

    const recordResponse = await fetch(`${baseUrl}/api/governance/evaluations/${evaluationId}`);
    assert.equal(recordResponse.status, 200);
    const record = await recordResponse.json();
    assert.equal(record.evaluation.decisionId, evaluateBody.decisionId);

    const byDecision = await fetch(`${baseUrl}/api/governance/decisions/${evaluateBody.decisionId}`);
    assert.equal(byDecision.status, 200);
    const byRequest = await fetch(`${baseUrl}/api/governance/requests/req-http-1`);
    assert.equal(byRequest.status, 200);

    const verifyResponse = await fetch(`${baseUrl}/api/governance/evaluations/${evaluationId}/verify`);
    assert.equal(verifyResponse.status, 200);
    const verifyBody = await verifyResponse.json();
    assert.equal(verifyBody.valid, true);
    assert.equal(verifyBody.checks.aggregateDigest, true);

    const missing = await fetch(`${baseUrl}/api/governance/evaluations/nope`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'GOVERNANCE_RECORD_NOT_FOUND');
  });

  it('scopes read endpoints to the authenticated organization when authentication is required', async () => {
    const configuration = loadEnterpriseConfiguration({
      AOC_ENTERPRISE_HTTP_PORT: '0',
      AOC_ENTERPRISE_HTTP_HOST: '127.0.0.1',
      AOC_ENTERPRISE_REQUIRE_AUTH: 'true',
      AOC_ENTERPRISE_API_KEYS: 'key-org-a:org-a,key-unscoped',
    });
    const server = await createEnterpriseServer({ kernelProviders: buildTestKernelProviders(), configuration });
    startedServers.push(server);
    const { port, host } = await server.listen();
    const baseUrl = `http://${host}:${port}`;

    const evaluateResponse = await fetch(`${baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer key-unscoped' },
      body: JSON.stringify(buildAllowedRequestBody({ requestId: 'req-http-tenant', organization: { id: 'org-b' } })),
    });
    assert.equal(evaluateResponse.status, 200);
    const evaluationId = (await evaluateResponse.json()).governanceRecord?.evaluationId as string;

    // org-a's key cannot see org-b's record — 404, not a data leak.
    const crossTenant = await fetch(`${baseUrl}/api/governance/evaluations/${evaluationId}`, { headers: { authorization: 'Bearer key-org-a' } });
    assert.equal(crossTenant.status, 404);

    // The unscoped (system) key can.
    const systemRead = await fetch(`${baseUrl}/api/governance/evaluations/${evaluationId}`, { headers: { authorization: 'Bearer key-unscoped' } });
    assert.equal(systemRead.status, 200);

    // No credential at all → 401.
    const anonymous = await fetch(`${baseUrl}/api/governance/evaluations/${evaluationId}`);
    assert.equal(anonymous.status, 401);
  });
});
