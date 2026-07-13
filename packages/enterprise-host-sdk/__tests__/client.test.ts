import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

import { createEnterpriseHostClient } from '../src/client.js';
import { EnterpriseHostApiError, EnterpriseHostNetworkError, EnterpriseHostTimeoutError } from '../src/errors.js';

interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

let server: Server;
let baseUrl: string;
const recorded: RecordedRequest[] = [];

// A scripted stub Host: the SDK is transport-only, so its contract is fully
// testable against canned responses -- no Enterprise runtime is imported.
before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      recorded.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      const respond = (status: number, body: unknown): void => {
        const payload = JSON.stringify(body);
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(payload);
      };

      if (req.url === '/live') return respond(200, { live: true, lifecycleState: 'ready' });
      if (req.url === '/api/governance/evaluate') {
        return respond(200, {
          requestId: 'req-1',
          decisionId: 'dec-1',
          status: 'allowed',
          summary: 'ok',
          reasonCodes: [],
          trace: { steps: [] },
          evaluatedAt: '2026-01-01T00:00:00.000Z',
          kernelVersion: '1.0.0',
          governanceRecord: { evaluationId: 'eval-1', aggregateDigest: 'sha256:0'.padEnd(71, '0') },
        });
      }
      if (req.url?.startsWith('/api/governance/evaluations/')) return respond(404, { error: { code: 'GOVERNANCE_RECORD_NOT_FOUND', message: 'missing', details: ['detail-1'] } });
      if (req.url === '/slow') {
        setTimeout(() => respond(200, {}), 5_000);
        return;
      }
      return respond(404, { error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.url}.` } });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('expected an inet address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('createEnterpriseHostClient', () => {
  it('sends bearer credentials and the idempotency key, and parses the evaluate response', async () => {
    const client = createEnterpriseHostClient({ baseUrl: `${baseUrl}/`, apiKey: 'secret-1' });
    const response = await client.evaluate(
      { actor: { id: 'a-1', trustDomainId: 'td-1' }, action: { type: 'act', resourceScope: 'scope' } },
      { idempotencyKey: 'idem-1' },
    );

    assert.equal(response.status, 'allowed');
    assert.equal(response.governanceRecord?.evaluationId, 'eval-1');
    const request = recorded[recorded.length - 1];
    if (request === undefined) throw new Error('no request recorded');
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/api/governance/evaluate');
    assert.equal(request.headers.authorization, 'Bearer secret-1');
    assert.equal(request.headers['idempotency-key'], 'idem-1');
    assert.equal(request.headers['content-type'], 'application/json');
    assert.equal(JSON.parse(request.body).actor.id, 'a-1');
  });

  it('reactivatePassport posts reactivatedBy (the field the Host route actually validates)', async () => {
    const client = createEnterpriseHostClient({ baseUrl });
    await client.reactivatePassport('passport-1', 'actor-1').catch(() => undefined);
    const request = recorded[recorded.length - 1];
    if (request === undefined) throw new Error('no request recorded');
    assert.equal(request.url, '/api/passports/passport-1/reactivate');
    assert.deepEqual(JSON.parse(request.body), { reactivatedBy: 'actor-1' });
  });

  it('URL-encodes path parameters', async () => {
    const client = createEnterpriseHostClient({ baseUrl });
    await client.getEvaluation('needs encoding/../x').catch(() => undefined);
    const request = recorded[recorded.length - 1];
    if (request === undefined) throw new Error('no request recorded');
    assert.equal(request.url, '/api/governance/evaluations/needs%20encoding%2F..%2Fx');
  });

  it('maps enveloped errors to EnterpriseHostApiError with status, code, and details', async () => {
    const client = createEnterpriseHostClient({ baseUrl });
    await assert.rejects(
      () => client.getEvaluation('missing-id'),
      (error: unknown) => {
        if (!(error instanceof EnterpriseHostApiError)) return false;
        assert.equal(error.status, 404);
        assert.equal(error.code, 'GOVERNANCE_RECORD_NOT_FOUND');
        assert.deepEqual(error.details, ['detail-1']);
        return true;
      },
    );
  });

  it('throws EnterpriseHostTimeoutError when timeoutMs elapses on a slow route', async () => {
    // Redirect the client's /live call to the stub's /slow route (answers after 5s).
    const client = createEnterpriseHostClient({
      baseUrl,
      timeoutMs: 150,
      fetch: (input, init) => fetch(input.replace('/live', '/slow'), init as Parameters<typeof fetch>[1]),
    });
    let caught: unknown;
    try {
      await client.live();
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof EnterpriseHostTimeoutError)) throw new Error('expected EnterpriseHostTimeoutError');
    assert.equal(caught.timeoutMs, 150);
  });

  it('does not time out fast routes within the budget', async () => {
    const client = createEnterpriseHostClient({ baseUrl, timeoutMs: 2_000 });
    const live = await client.live();
    assert.equal(live.live, true);
  });

  it('throws EnterpriseHostNetworkError when the host is unreachable', async () => {
    const client = createEnterpriseHostClient({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 2_000 });
    await assert.rejects(
      () => client.live(),
      (error: unknown) => error instanceof EnterpriseHostNetworkError,
    );
  });
});
