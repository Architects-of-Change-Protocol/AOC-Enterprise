import type { IncomingMessage, ServerResponse } from 'node:http';

import { EnterpriseHttpError } from '../api/enterprise-http-errors.js';
import type { AocEnterprise } from '../composition/composition-root.js';

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB -- generous for a governance-evaluation payload, small enough to bound memory per request.

function readRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        rejectPromise(new EnterpriseHttpError(400, 'INVALID_REQUEST', 'Request body exceeds the maximum accepted size.'));
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
        rejectPromise(new EnterpriseHttpError(400, 'INVALID_REQUEST', 'Request body must be valid JSON.'));
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

function writeError(res: ServerResponse, error: unknown, enterprise: AocEnterprise): void {
  if (error instanceof EnterpriseHttpError) {
    writeJson(res, error.httpStatus, {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
        ...(error.extra ?? {}),
      },
    });
    return;
  }
  enterprise.logger.error('enterprise.http.unhandled_error', { route: 'POST /api/governance/evaluate' });
  writeJson(res, 500, { error: { code: 'INFRASTRUCTURE_FAILURE', message: 'An unexpected Enterprise Host failure occurred.' } });
}

/**
 * The only module in this tree that knows about `IncomingMessage`/
 * `ServerResponse`. Everything it does is translate HTTP <-> the
 * framework-agnostic `AocEnterprise` calls -- no governance logic, no
 * persistence, no composition lives here.
 */
export function createEnterpriseRequestListener(enterprise: AocEnterprise): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (method === 'GET' && url.pathname === '/health') {
      enterprise
        .health()
        .then((report) => writeJson(res, report.status === 'unhealthy' ? 503 : 200, report))
        .catch((error: unknown) => writeError(res, error, enterprise));
      return;
    }

    if (method === 'GET' && url.pathname === '/live') {
      const live = enterprise.isLive();
      writeJson(res, live ? 200 : 503, { live, lifecycleState: enterprise.lifecycleState() });
      return;
    }

    if (method === 'GET' && url.pathname === '/ready') {
      const ready = enterprise.isReady();
      writeJson(res, ready ? 200 : 503, { ready, lifecycleState: enterprise.lifecycleState() });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/governance/evaluate') {
      readRequestBody(req)
        .then((rawBody) => enterprise.evaluate(rawBody, req.headers.authorization !== undefined ? { authorizationHeader: req.headers.authorization } : undefined))
        .then((outcome) => writeJson(res, outcome.httpStatus, outcome.body))
        .catch((error: unknown) => writeError(res, error, enterprise));
      return;
    }

    writeJson(res, 404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${url.pathname}.` } });
  };
}
