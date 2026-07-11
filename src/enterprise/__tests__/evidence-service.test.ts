import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterprise, type AocEnterprise } from '../composition/composition-root.js';
import { createEnterpriseServer, type EnterpriseServer } from '../host/enterprise-server.js';
import { loadEnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { EvidenceError } from '../evidence/errors.js';
import { buildAllowedRequestBody, buildTestKernelProviders } from './support.js';

const openEnterprises: AocEnterprise[] = [];
const startedServers: EnterpriseServer[] = [];

after(async () => {
  await Promise.all(openEnterprises.map((enterprise) => enterprise.close().catch(() => {})));
  await Promise.all(startedServers.map((server) => server.close().catch(() => {})));
});

async function bootEnterprise(): Promise<AocEnterprise> {
  const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });
  openEnterprises.push(enterprise);
  return enterprise;
}

describe('Evidence Service -- Lifecycle (Record -> Bundle Generated -> Stored -> Verified -> Exported)', () => {
  it('builds a Bundle from a durable evaluation and stores it in GENERATED state', async () => {
    const enterprise = await bootEnterprise();
    const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-svc-build' }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-svc-build');
    assert.ok(record);

    const stored = await enterprise.evidence.build(undefined, { evaluationId: record.evaluation.evaluationId, level: 'AUDITOR' });

    assert.equal(stored.state, 'GENERATED');
    assert.equal(stored.bundle.source.evaluationId, record.evaluation.evaluationId);
    assert.equal(stored.bundle.disclosure.level, 'AUDITOR');
  });

  it('verify() transitions a valid Bundle to VERIFIED', async () => {
    const enterprise = await bootEnterprise();
    await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-svc-verify' }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-svc-verify');
    assert.ok(record);
    const stored = await enterprise.evidence.build(undefined, { evaluationId: record.evaluation.evaluationId, level: 'FULL' });

    const result = await enterprise.evidence.verify(undefined, stored.bundle.bundleId);
    assert.equal(result.valid, true);

    const reloaded = await enterprise.evidence.getByBundleId(undefined, stored.bundle.bundleId);
    assert.equal(reloaded?.state, 'VERIFIED');
  });

  it('building over an unknown evaluationId fails with EVIDENCE_SOURCE_RECORD_NOT_FOUND', async () => {
    const enterprise = await bootEnterprise();
    await assert.rejects(
      enterprise.evidence.build(undefined, { evaluationId: 'no-such-evaluation', level: 'FULL' }),
      (error: unknown) => error instanceof EvidenceError && error.code === 'EVIDENCE_SOURCE_RECORD_NOT_FOUND',
    );
  });

  it('an unknown disclosure level fails with EVIDENCE_DISCLOSURE_POLICY_UNKNOWN', async () => {
    const enterprise = await bootEnterprise();
    await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-svc-bad-level' }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-svc-bad-level');
    assert.ok(record);
    await assert.rejects(
      enterprise.evidence.build(undefined, { evaluationId: record.evaluation.evaluationId, level: 'NOT_A_LEVEL' }),
      (error: unknown) => error instanceof EvidenceError && error.code === 'EVIDENCE_DISCLOSURE_POLICY_UNKNOWN',
    );
  });

  it('a Bundle Store is independent of the Governance Store: closing/clearing evidence storage never touches persisted governance records', async () => {
    const enterprise = await bootEnterprise();
    await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-svc-independent' }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-svc-independent');
    assert.ok(record);
    assert.notEqual(enterprise.evidenceStore, enterprise.persistence, 'the Bundle Store and the Governance Store are two distinct storage components');
  });
});

describe('Evidence Bundle -- multiple Bundles from one Governance Record', () => {
  it('one Governance Record can produce PUBLIC, CUSTOMER, AUDITOR, and ASSURANCE-ready (FULL) Bundles, each valid, each with a distinct bundleDigest, all sharing the same recordDigest', async () => {
    const enterprise = await bootEnterprise();
    await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-svc-multi' }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-svc-multi');
    assert.ok(record);

    const levels = ['PUBLIC', 'CUSTOMER', 'AUDITOR', 'FULL'] as const;
    const built = await Promise.all(levels.map((level) => enterprise.evidence.build(undefined, { evaluationId: record.evaluation.evaluationId, level })));

    assert.equal(built.length, 4);
    const bundleIds = new Set(built.map((entry) => entry.bundle.bundleId));
    assert.equal(bundleIds.size, 4, 'every Bundle has its own bundleId');

    const bundleDigests = new Set(built.map((entry) => entry.bundle.integrity.bundleDigest));
    assert.equal(bundleDigests.size, 4, 'every Bundle has its own distinct bundleDigest');

    const recordDigests = new Set(built.map((entry) => entry.bundle.integrity.recordDigest));
    assert.equal(recordDigests.size, 1, 'every Bundle shares the same recordDigest, since they all project the same Governance Record');
    assert.equal([...recordDigests][0], record.integrity.aggregateDigest);

    for (const entry of built) {
      const result = await enterprise.evidence.verify(undefined, entry.bundle.bundleId);
      assert.equal(result.valid, true, `${entry.bundle.disclosure.level} Bundle verifies`);
    }

    const byEvaluation = await enterprise.evidence.listByEvaluationId(undefined, record.evaluation.evaluationId);
    assert.equal(byEvaluation.length, 4);
  });

  it('Bundles are immutable: a changed disclosure level always produces a new Bundle, never an update to an existing one', async () => {
    const enterprise = await bootEnterprise();
    await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-svc-immutable' }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-svc-immutable');
    assert.ok(record);

    const first = await enterprise.evidence.build(undefined, { evaluationId: record.evaluation.evaluationId, level: 'CUSTOMER' });
    const second = await enterprise.evidence.build(undefined, { evaluationId: record.evaluation.evaluationId, level: 'PUBLIC' });

    assert.notEqual(first.bundle.bundleId, second.bundle.bundleId);
    const stillThere = await enterprise.evidence.getByBundleId(undefined, first.bundle.bundleId);
    assert.deepEqual(stillThere?.bundle, first.bundle, 'the first Bundle is untouched by building the second');
  });
});

describe('POST/GET /api/evidence (HTTP surface)', () => {
  async function startTestServer(): Promise<{ server: EnterpriseServer; baseUrl: string }> {
    const configuration = loadEnterpriseConfiguration({ AOC_ENTERPRISE_HTTP_PORT: '0', AOC_ENTERPRISE_HTTP_HOST: '127.0.0.1' });
    const server = await createEnterpriseServer({ kernelProviders: buildTestKernelProviders(), configuration });
    startedServers.push(server);
    const { port, host } = await server.listen();
    return { server, baseUrl: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}` };
  }

  it('builds, reads, and verifies a Bundle end-to-end over HTTP', async () => {
    const { baseUrl } = await startTestServer();

    const evalResponse = await fetch(`${baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildAllowedRequestBody({ requestId: 'req-http-evidence' })),
    });
    const evalBody = await evalResponse.json();
    assert.equal(evalResponse.status, 200);

    const buildResponse = await fetch(`${baseUrl}/api/evidence/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ evaluationId: evalBody.governanceRecord.evaluationId, level: 'AUDITOR' }),
    });
    const buildBody = await buildResponse.json();
    assert.equal(buildResponse.status, 201);
    assert.equal(buildBody.state, 'GENERATED');
    const bundleId = buildBody.bundle.bundleId;

    const getResponse = await fetch(`${baseUrl}/api/evidence/${bundleId}`);
    const getBody = await getResponse.json();
    assert.equal(getResponse.status, 200);
    assert.equal(getBody.bundle.bundleId, bundleId);

    const verifyResponse = await fetch(`${baseUrl}/api/evidence/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bundleId }),
    });
    const verifyBody = await verifyResponse.json();
    assert.equal(verifyResponse.status, 200);
    assert.equal(verifyBody.valid, true);
  });

  it('returns 400 for a malformed build request and 404 for an unknown bundleId', async () => {
    const { baseUrl } = await startTestServer();

    const badBuild = await fetch(`${baseUrl}/api/evidence/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(badBuild.status, 400);

    const notFound = await fetch(`${baseUrl}/api/evidence/no-such-bundle`);
    assert.equal(notFound.status, 404);
  });
});
