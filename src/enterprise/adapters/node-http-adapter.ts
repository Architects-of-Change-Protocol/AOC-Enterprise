import type { IncomingMessage, ServerResponse } from 'node:http';

import { EnterpriseHttpError, mapEvidenceErrorToHttp } from '../api/enterprise-http-errors.js';
import type { AocEnterprise } from '../composition/composition-root.js';
import { validateEvidenceBuildRequestBody, validateEvidenceVerifyRequestBody, toEvidenceBundleResponseBody, toEvidenceVerifyResponseBody } from '../api/evidence-contract.js';
import { isEvidenceError } from '../evidence/errors.js';

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
  const httpError = error instanceof EnterpriseHttpError ? error : isEvidenceError(error) ? mapEvidenceErrorToHttp(error) : undefined;
  if (httpError !== undefined) {
    writeJson(res, httpError.httpStatus, {
      error: {
        code: httpError.code,
        message: httpError.message,
        ...(httpError.details !== undefined ? { details: httpError.details } : {}),
        ...(httpError.extra ?? {}),
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
      const idempotencyKeyHeader = req.headers['idempotency-key'];
      const idempotencyKey = Array.isArray(idempotencyKeyHeader) ? idempotencyKeyHeader[0] : idempotencyKeyHeader;
      readRequestBody(req)
        .then((rawBody) =>
          enterprise.evaluate(rawBody, {
            ...(req.headers.authorization !== undefined ? { authorizationHeader: req.headers.authorization } : {}),
            ...(idempotencyKey !== undefined && idempotencyKey.length > 0 ? { idempotencyKey } : {}),
          }),
        )
        .then((outcome) => writeJson(res, outcome.httpStatus, outcome.body))
        .catch((error: unknown) => writeError(res, error, enterprise));
      return;
    }

    // -- PR-005 Evidence Bundle endpoints. Tenant scoping is resolved
    // entirely inside `enterprise.evidence` (never here), the same way the
    // PR-004 governance-read routes below defer to `governanceReads`.
    if (method === 'POST' && url.pathname === '/api/evidence/build') {
      readRequestBody(req)
        .then((rawBody) => enterprise.evidence.build(req.headers.authorization, validateEvidenceBuildRequestBody(rawBody)))
        .then((record) => writeJson(res, 201, toEvidenceBundleResponseBody(record)))
        .catch((error: unknown) => writeError(res, error, enterprise));
      return;
    }

    if (method === 'POST' && url.pathname === '/api/evidence/verify') {
      readRequestBody(req)
        .then((rawBody) => enterprise.evidence.verify(req.headers.authorization, validateEvidenceVerifyRequestBody(rawBody).bundleId))
        .then((result) => writeJson(res, 200, toEvidenceVerifyResponseBody(result)))
        .catch((error: unknown) => writeError(res, error, enterprise));
      return;
    }

    if (method === 'GET') {
      const evidenceMatch = /^\/api\/evidence\/([^/]+)$/.exec(url.pathname);
      if (evidenceMatch?.[1] !== undefined) {
        const bundleId = decodeURIComponent(evidenceMatch[1]);
        enterprise.evidence
          .getByBundleId(req.headers.authorization, bundleId)
          .then((record) => {
            if (record === null) {
              writeJson(res, 404, { error: { code: 'EVIDENCE_BUNDLE_NOT_FOUND', message: `No Evidence Bundle for bundleId '${bundleId}'.` } });
              return;
            }
            writeJson(res, 200, toEvidenceBundleResponseBody(record));
          })
          .catch((error: unknown) => writeError(res, error, enterprise));
        return;
      }
    }

    // -- PR-004 Governance Store read/verify endpoints. All access-context
    // resolution and tenant scoping happens inside `enterprise.governanceReads`
    // (never here); this adapter only routes.
    if (method === 'GET') {
      const readMatch = matchGovernanceReadRoute(url.pathname);
      if (readMatch !== undefined) {
        const auth = req.headers.authorization;
        const respond = (promise: Promise<unknown>, notFoundMessage: string) =>
          promise
            .then((recordOrResult) => {
              if (recordOrResult === null) {
                writeJson(res, 404, { error: { code: 'GOVERNANCE_RECORD_NOT_FOUND', message: notFoundMessage } });
                return;
              }
              writeJson(res, 200, recordOrResult);
            })
            .catch((error: unknown) => writeError(res, error, enterprise));

        switch (readMatch.kind) {
          case 'evaluation':
            respond(enterprise.governanceReads.getByEvaluationId(auth, readMatch.id), `No governance record for evaluationId '${readMatch.id}'.`);
            return;
          case 'evaluation-verify':
            respond(enterprise.governanceReads.verify(auth, readMatch.id), `No governance record for evaluationId '${readMatch.id}'.`);
            return;
          case 'decision':
            respond(enterprise.governanceReads.getByDecisionId(auth, readMatch.id), `No governance record for decisionId '${readMatch.id}'.`);
            return;
          case 'request':
            respond(enterprise.governanceReads.getByRequestId(auth, readMatch.id), `No governance record for requestId '${readMatch.id}'.`);
            return;
        }
      }
    }

    writeJson(res, 404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${url.pathname}.` } });
  };
}

type GovernanceReadRoute =
  | { readonly kind: 'evaluation' | 'evaluation-verify' | 'decision' | 'request'; readonly id: string };

function matchGovernanceReadRoute(pathname: string): GovernanceReadRoute | undefined {
  const verifyMatch = /^\/api\/governance\/evaluations\/([^/]+)\/verify$/.exec(pathname);
  if (verifyMatch?.[1] !== undefined) return { kind: 'evaluation-verify', id: decodeURIComponent(verifyMatch[1]) };
  const evaluationMatch = /^\/api\/governance\/evaluations\/([^/]+)$/.exec(pathname);
  if (evaluationMatch?.[1] !== undefined) return { kind: 'evaluation', id: decodeURIComponent(evaluationMatch[1]) };
  const decisionMatch = /^\/api\/governance\/decisions\/([^/]+)$/.exec(pathname);
  if (decisionMatch?.[1] !== undefined) return { kind: 'decision', id: decodeURIComponent(decisionMatch[1]) };
  const requestMatch = /^\/api\/governance\/requests\/([^/]+)$/.exec(pathname);
  if (requestMatch?.[1] !== undefined) return { kind: 'request', id: decodeURIComponent(requestMatch[1]) };
  return undefined;
}
