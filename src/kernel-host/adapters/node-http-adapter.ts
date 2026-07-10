import type { IncomingMessage, ServerResponse } from 'node:http';

import { RuntimeHttpError } from '../api/runtime-http-errors.js';
import type { RuntimeHost } from '../dependency-injection/composition-root.js';

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB -- generous for a governance-evaluation payload, small enough to bound memory per request.

function readRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        rejectPromise(new RuntimeHttpError(400, 'INVALID_REQUEST', 'Request body exceeds the maximum accepted size.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        rejectPromise(new RuntimeHttpError(400, 'INVALID_REQUEST', 'Request body must be valid JSON.'));
      }
    });
    req.on('error', rejectPromise);
  });
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

function writeError(res: ServerResponse, error: unknown, host: RuntimeHost): void {
  if (error instanceof RuntimeHttpError) {
    writeJson(res, error.httpStatus, {
      error: { code: error.code, message: error.message, ...(error.details !== undefined ? { details: error.details } : {}) },
    });
    return;
  }
  host.logger.error('runtime.http.unhandled_error', { route: 'POST /api/governance/evaluate' });
  writeJson(res, 500, { error: { code: 'INFRASTRUCTURE_FAILURE', message: 'An unexpected Runtime failure occurred.' } });
}

/**
 * The only module in this tree that knows about `IncomingMessage`/
 * `ServerResponse`. Everything it does is translate HTTP <-> the
 * framework-agnostic `RuntimeHost` calls -- no governance logic, no
 * persistence, no DI live here.
 */
export function createRuntimeHostRequestListener(host: RuntimeHost): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (method === 'GET' && url.pathname === '/health') {
      host
        .getHealth()
        .then((report) => writeJson(res, report.status === 'unhealthy' ? 503 : 200, report))
        .catch((error: unknown) => writeError(res, error, host));
      return;
    }

    if (method === 'POST' && url.pathname === '/api/governance/evaluate') {
      readRequestBody(req)
        .then((rawBody) => host.handleGovernanceEvaluate({ rawBody, ...(req.headers.authorization !== undefined ? { authorizationHeader: req.headers.authorization } : {}) }))
        .then((outcome) => writeJson(res, outcome.httpStatus, outcome.body))
        .catch((error: unknown) => writeError(res, error, host));
      return;
    }

    writeJson(res, 404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${url.pathname}.` } });
  };
}
