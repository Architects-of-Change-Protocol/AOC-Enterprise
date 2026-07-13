import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseServer, type EnterpriseServer } from '../host/enterprise-server.js';
import { loadEnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { matchApiKey } from '../orchestration/credential-matching.js';
import { buildTestKernelProviders } from './support.js';

const startedServers: EnterpriseServer[] = [];

async function startTestServer(env: Record<string, string> = {}): Promise<{ server: EnterpriseServer; baseUrl: string }> {
  const configuration = loadEnterpriseConfiguration({
    AOC_ENTERPRISE_HTTP_PORT: '0',
    AOC_ENTERPRISE_HTTP_HOST: '127.0.0.1',
    ...env,
  });
  const server = await createEnterpriseServer({ kernelProviders: buildTestKernelProviders(), configuration });
  startedServers.push(server);
  const { port, host } = await server.listen();
  return { server, baseUrl: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}` };
}

after(async () => {
  await Promise.all(startedServers.map((server) => server.close()));
});

describe('HTTP adapter fail-closed hardening', () => {
  it('returns a 400 error envelope (not a dropped connection) for malformed percent-encoding in a path segment', async () => {
    const started = await startTestServer();

    for (const path of ['/api/passports/%ZZ', '/api/evidence/%E0%A4%A', '/api/assurance/assessments/%ZZ', '/api/governance/evaluations/%ZZ']) {
      const response = await fetch(`${started.baseUrl}${path}`);
      const body = await response.json();
      assert.equal(response.status, 400, `expected 400 for ${path}`);
      assert.equal(body.error.code, 'INVALID_REQUEST');
    }
  });

  it('returns a 401 error envelope for unauthenticated passport and assurance requests when authentication is required', async () => {
    const started = await startTestServer({
      AOC_ENTERPRISE_REQUIRE_AUTH: 'true',
      AOC_ENTERPRISE_API_KEYS: 'secret-key-1:org-acme',
    });

    const passportResponse = await fetch(`${started.baseUrl}/api/passports/pass-1`);
    const passportBody = await passportResponse.json();
    assert.equal(passportResponse.status, 401);
    assert.equal(passportBody.error.code, 'AUTHENTICATION_FAILED');

    const assuranceResponse = await fetch(`${started.baseUrl}/api/assurance/signals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const assuranceBody = await assuranceResponse.json();
    assert.equal(assuranceResponse.status, 401);
    assert.equal(assuranceBody.error.code, 'AUTHENTICATION_FAILED');

    const issueResponse = await fetch(`${started.baseUrl}/api/passports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-key' },
      body: JSON.stringify({}),
    });
    const issueBody = await issueResponse.json();
    assert.equal(issueResponse.status, 401);
    assert.equal(issueBody.error.code, 'AUTHENTICATION_FAILED');
  });

  it('still serves later requests after a request that previously crashed the listener', async () => {
    const started = await startTestServer();

    await fetch(`${started.baseUrl}/api/passports/%ZZ`).catch(() => undefined);

    const health = await fetch(`${started.baseUrl}/live`);
    assert.equal(health.status, 200);
  });
});

describe('constant-time API key matching', () => {
  const keys = [{ key: 'key-alpha', organizationId: 'org-a' }, { key: 'key-beta' }] as const;

  it('matches the correct configured key', () => {
    assert.deepEqual(matchApiKey('key-alpha', keys), keys[0]);
    assert.deepEqual(matchApiKey('key-beta', keys), keys[1]);
  });

  it('rejects unknown, prefix, and empty candidates', () => {
    assert.equal(matchApiKey('key-alph', keys), undefined);
    assert.equal(matchApiKey('key-alphaa', keys), undefined);
    assert.equal(matchApiKey('', keys), undefined);
    assert.equal(matchApiKey('key-alpha', []), undefined);
  });
});
