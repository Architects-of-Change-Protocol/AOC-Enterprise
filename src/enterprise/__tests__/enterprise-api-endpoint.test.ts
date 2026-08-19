import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseServer, type EnterpriseServer } from '../host/enterprise-server.js';
import { loadEnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { buildAllowedRequestBody, buildApprovalRequiredRequestBody, buildDeniedRequestBody, buildTestKernelProviders } from './support.js';

const startedServers: EnterpriseServer[] = [];

async function startTestServer(overrides: Parameters<typeof createEnterpriseServer>[0] = {}): Promise<{ server: EnterpriseServer; baseUrl: string }> {
  const configuration =
    overrides.configuration ??
    loadEnterpriseConfiguration({
      AOC_ENTERPRISE_HTTP_PORT: '0',
      AOC_ENTERPRISE_HTTP_HOST: '127.0.0.1',
      AOC_ENTERPRISE_EVENTS_ENABLED: 'true',
    });
  const server = await createEnterpriseServer({ kernelProviders: buildTestKernelProviders(), ...overrides, configuration });
  startedServers.push(server);
  const { port, host } = await server.listen();
  return { server, baseUrl: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}` };
}

after(async () => {
  await Promise.all(startedServers.map((server) => server.close()));
});

describe('POST /api/governance/evaluate (Soberanía Enterprise API)', () => {
  it('returns 200 and an allowed decision for a fully-authorized request, executing the real Kernel', async () => {
    const started = await startTestServer();

    const response = await fetch(`${started.baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildAllowedRequestBody({ requestId: 'req-allowed-1', correlationId: 'corr-1' })),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'allowed');
    assert.equal(body.requestId, 'req-allowed-1');
    assert.equal(body.correlationId, 'corr-1');
    assert.ok(typeof body.decisionId === 'string' && body.decisionId.length > 0);
    assert.ok(Array.isArray(body.reasonCodes));
    assert.ok(Array.isArray(body.trace.steps));
    assert.equal(body.kernelVersion, '1.0.0');
    assert.equal(body.internal, undefined);
  });

  it('returns 422 for a governance denial, not a 4xx/5xx infrastructure error shape', async () => {
    const started = await startTestServer();

    const response = await fetch(`${started.baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildDeniedRequestBody({ requestId: 'req-denied-1' })),
    });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.status, 'denied');
    assert.ok(body.reasonCodes.length > 0);
  });

  it('returns 200 for approval_required -- a successful evaluation, not an error', async () => {
    const started = await startTestServer();

    const response = await fetch(`${started.baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildApprovalRequiredRequestBody({ requestId: 'req-approval-1' })),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'approval_required');
  });

  it('returns 400 for a structurally invalid request body', async () => {
    const started = await startTestServer();

    const response = await fetch(`${started.baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actor: {} }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_REQUEST');
    assert.ok(body.error.details.length > 0);
  });

  it('returns 400 for malformed JSON', async () => {
    const started = await startTestServer();

    const response = await fetch(`${started.baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });

    assert.equal(response.status, 400);
  });

  it('returns 404 for an unknown route', async () => {
    const started = await startTestServer();

    const response = await fetch(`${started.baseUrl}/nope`);
    assert.equal(response.status, 404);
  });

  it('enforces authentication when configured, and 403s a credential scoped to a different organization', async () => {
    const configuration = loadEnterpriseConfiguration({
      AOC_ENTERPRISE_HTTP_PORT: '0',
      AOC_ENTERPRISE_HTTP_HOST: '127.0.0.1',
      AOC_ENTERPRISE_REQUIRE_AUTH: 'true',
      AOC_ENTERPRISE_API_KEYS: 'key-open,key-acme:org-acme',
    });
    const started = await startTestServer({ configuration });

    const noAuth = await fetch(`${started.baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildAllowedRequestBody({ requestId: 'req-auth-1' })),
    });
    assert.equal(noAuth.status, 401);

    const badKey = await fetch(`${started.baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer nope' },
      body: JSON.stringify(buildAllowedRequestBody({ requestId: 'req-auth-2' })),
    });
    assert.equal(badKey.status, 401);

    const wrongOrgKey = await fetch(`${started.baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer key-acme' },
      body: JSON.stringify(buildAllowedRequestBody({ requestId: 'req-auth-3', organization: { id: 'org-beta' } })),
    });
    assert.equal(wrongOrgKey.status, 403);

    const goodKey = await fetch(`${started.baseUrl}/api/governance/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer key-open' },
      body: JSON.stringify(buildAllowedRequestBody({ requestId: 'req-auth-4' })),
    });
    assert.equal(goodKey.status, 200);
  });
});

describe('GET /health', () => {
  it('reports enterprise/kernel version, persistence connectivity, and provider status with no sensitive fields', async () => {
    const started = await startTestServer();

    const response = await fetch(`${started.baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'healthy');
    assert.equal(body.enterpriseVersion, '1.0.0');
    assert.equal(body.kernelVersion, '1.0.0');
    assert.equal(body.persistence.connected, true);
    assert.equal(body.persistence.status, 'connected');
    assert.ok(body.providers.loaded.includes('recognitionProvider'));
    assert.ok(!JSON.stringify(body).toLowerCase().includes('apikey'));
    assert.ok(!JSON.stringify(body).toLowerCase().includes('bearer'));
  });
});
