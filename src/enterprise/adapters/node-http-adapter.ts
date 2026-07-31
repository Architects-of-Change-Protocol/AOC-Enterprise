import type { IncomingMessage, ServerResponse } from 'node:http';

import { EnterpriseHttpError, EnterpriseHttpErrors, mapEvidenceErrorToHttp, mapAgentPassportErrorToHttp, mapAssuranceErrorToHttp, mapRuntimeAuthorityErrorToHttp } from '../api/enterprise-http-errors.js';
import type { AocEnterprise } from '../composition/composition-root.js';
import { validateEvidenceBuildRequestBody, validateEvidenceVerifyRequestBody, toEvidenceBundleResponseBody, toEvidenceVerifyResponseBody } from '../api/evidence-contract.js';
import { isEvidenceError } from '../evidence/errors.js';
import { resolveGovernanceAccessContext } from '../orchestration/governance-read-service.js';
import {
  validateActorRequestBody,
  validateBuildViewRequestBody,
  validateIssuePassportRequestBody,
  validateLinkEvidenceRequestBody,
  validateLinkGovernanceRequestBody,
  validateRetireRequestBody,
  validateRevokeRequestBody,
  validateSuspendRequestBody,
  validateVerifyRequestBody,
} from '../api/passport-contract.js';
import { isAgentPassportError } from '../passport/errors.js';
import { isAssuranceError } from '../assurance/errors.js';
import {
  validateCreateAssessmentRequestBody,
  validateEvaluateAssessmentRequestBody,
  validateFindingEventRequestBody,
  validateManualReviewRequestBody,
  validateReassessRequestBody,
  validateSignalRequestBody,
} from '../api/assurance-contract.js';
import { isRuntimeAuthorityError } from '../runtime-authority/errors.js';
import {
  mapGatewayDecisionToHttpStatus,
  validateActorIdRequestBody,
  validateControlRequestBody,
  validateCreateRuntimeRequestBody,
  validateGrantCapabilityRequestBody,
  validateIssueLeaseRequestBody,
  validateProtectedActionRequestBody,
  validateRegisterAgentRequestBody,
  validateResumeRequestBody,
} from '../api/runtime-authority-contract.js';

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

function isPlainObjectBody(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

function writeError(res: ServerResponse, error: unknown, enterprise: AocEnterprise, route: string): void {
  const httpError =
    error instanceof EnterpriseHttpError
      ? error
      : isEvidenceError(error)
        ? mapEvidenceErrorToHttp(error)
        : isAgentPassportError(error)
          ? mapAgentPassportErrorToHttp(error)
          : isAssuranceError(error)
            ? mapAssuranceErrorToHttp(error)
            : isRuntimeAuthorityError(error)
              ? mapRuntimeAuthorityErrorToHttp(error)
              : undefined;
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
  enterprise.logger.error('enterprise.http.unhandled_error', { route });
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
    const routeLabel = `${method} ${(req.url ?? '/').slice(0, 256)}`;
    const fail = (error: unknown): void => writeError(res, normalizePathDecodeError(error), enterprise, routeLabel);
    try {
      dispatch();
    } catch (error) {
      fail(error);
    }

    // Everything reachable from here must fail closed: a synchronous throw
    // (auth rejection, malformed percent-encoding, invalid URL) becomes an
    // HTTP error envelope via `fail`, never an uncaught process exception.
    function dispatch(): void {
      const url = new URL(req.url ?? '/', 'http://localhost');

      if (method === 'GET' && url.pathname === '/health') {
        enterprise
          .health()
          .then((report) => writeJson(res, report.status === 'unhealthy' ? 503 : 200, report))
          .catch(fail);
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
          .catch(fail);
        return;
      }

      // -- PR-005 Evidence Bundle endpoints. Tenant scoping is resolved
      // entirely inside `enterprise.evidence` (never here), the same way the
      // PR-004 governance-read routes below defer to `governanceReads`.
      if (method === 'POST' && url.pathname === '/api/evidence/build') {
        readRequestBody(req)
          .then((rawBody) => enterprise.evidence.build(req.headers.authorization, validateEvidenceBuildRequestBody(rawBody)))
          .then((record) => writeJson(res, 201, toEvidenceBundleResponseBody(record)))
          .catch(fail);
        return;
      }

      if (method === 'POST' && url.pathname === '/api/evidence/verify') {
        readRequestBody(req)
          .then((rawBody) => enterprise.evidence.verify(req.headers.authorization, validateEvidenceVerifyRequestBody(rawBody).bundleId))
          .then((result) => writeJson(res, 200, toEvidenceVerifyResponseBody(result)))
          .catch(fail);
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
            .catch(fail);
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
              .catch(fail);

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

      // -- PR-007 Assurance Runtime endpoints (mission section 58). Tenant
      // scoping, control logic, evidence selection, scoring, and eligibility
      // all live inside `enterprise.assurance` -- this adapter only routes.
      if (url.pathname.startsWith('/api/assurance/')) {
        const context = resolveGovernanceAccessContext(req.headers.authorization, enterprise.configuration);
        const { assurance } = enterprise;

        if (method === 'POST' && url.pathname === '/api/assurance/assessments') {
          readRequestBody(req)
            .then((rawBody) => assurance.createAssessment(context, validateCreateAssessmentRequestBody(rawBody)))
            .then((assessment) => writeJson(res, 201, assessment))
            .catch(fail);
          return;
        }

        const assessmentAction = /^\/api\/assurance\/assessments\/([^/]+)\/(evaluate|verify|findings)$/.exec(url.pathname);
        if (assessmentAction?.[1] !== undefined && assessmentAction[2] !== undefined) {
          const assessmentId = decodeURIComponent(assessmentAction[1]);
          if (method === 'POST' && assessmentAction[2] === 'evaluate') {
            readRequestBody(req)
              .then(async (rawBody) => {
                const body = validateEvaluateAssessmentRequestBody(rawBody);
                let assessment = await assurance.evaluateAssessment(context, assessmentId);
                if (body.complete !== false && assessment.status === 'evaluating') {
                  assessment = await assurance.completeAssessment(context, assessmentId);
                }
                return assessment;
              })
              .then((assessment) => writeJson(res, 200, assessment))
              .catch(fail);
            return;
          }
          if (method === 'POST' && assessmentAction[2] === 'verify') {
            assurance
              .verifyAssessment(context, assessmentId)
              .then((result) => writeJson(res, result.valid ? 200 : 409, result))
              .catch(fail);
            return;
          }
          if (method === 'GET' && assessmentAction[2] === 'findings') {
            assurance
              .listFindings(context, assessmentId)
              .then((findings) => writeJson(res, 200, { assessmentId, findings }))
              .catch(fail);
            return;
          }
        }

        const assessmentMatch = /^\/api\/assurance\/assessments\/([^/]+)$/.exec(url.pathname);
        if (method === 'GET' && assessmentMatch?.[1] !== undefined) {
          const assessmentId = decodeURIComponent(assessmentMatch[1]);
          assurance
            .getAssessment(context, assessmentId)
            .then((assessment) => {
              if (assessment === null) {
                writeJson(res, 404, { error: { code: 'ASSURANCE_ASSESSMENT_NOT_FOUND', message: `No Assurance assessment for assessmentId '${assessmentId}'.` } });
                return;
              }
              writeJson(res, 200, assessment);
            })
            .catch(fail);
          return;
        }

        const findingEventsMatch = /^\/api\/assurance\/findings\/([^/]+)\/events$/.exec(url.pathname);
        if (method === 'POST' && findingEventsMatch?.[1] !== undefined) {
          const findingId = decodeURIComponent(findingEventsMatch[1]);
          readRequestBody(req)
            .then((rawBody) => assurance.appendFindingEvent(context, validateFindingEventRequestBody(rawBody, findingId)))
            .then((event) => writeJson(res, 201, event))
            .catch(fail);
          return;
        }

        if (method === 'POST' && url.pathname === '/api/assurance/manual-reviews') {
          readRequestBody(req)
            .then((rawBody) => assurance.recordManualReview(context, validateManualReviewRequestBody(rawBody)))
            .then((review) => writeJson(res, 201, review))
            .catch(fail);
          return;
        }

        if (method === 'POST' && url.pathname === '/api/assurance/signals') {
          readRequestBody(req)
            .then((rawBody) => assurance.processSignal(context, validateSignalRequestBody(rawBody)))
            .then((result) => writeJson(res, 201, result))
            .catch(fail);
          return;
        }

        const subjectMatch = /^\/api\/assurance\/subjects\/([^/]+)\/(state|reassess)$/.exec(url.pathname);
        if (subjectMatch?.[1] !== undefined && subjectMatch[2] !== undefined) {
          const subjectId = decodeURIComponent(subjectMatch[1]);
          if (method === 'GET' && subjectMatch[2] === 'state') {
            const frameworkId = url.searchParams.get('frameworkId') ?? undefined;
            const frameworkVersion = url.searchParams.get('frameworkVersion') ?? undefined;
            assurance
              .getContinuousState(context, subjectId, frameworkId, frameworkVersion)
              .then((state) => writeJson(res, 200, state))
              .catch(fail);
            return;
          }
          if (method === 'POST' && subjectMatch[2] === 'reassess') {
            readRequestBody(req)
              .then((rawBody) => assurance.requestReassessment(context, validateReassessRequestBody(rawBody, subjectId)))
              .then((assessment) => writeJson(res, 201, assessment))
              .catch(fail);
            return;
          }
        }
      }

      // -- AOC Runtime Authority endpoints. Tenant scoping is resolved via
      // the same credential-matching the Governance-read/Assurance routes
      // use; every mutating call still re-derives tenant scope from the
      // stored runtime/agent record inside `enterprise.runtimeAuthority`
      // (never trusted from the URL alone). This adapter only routes and
      // maps a `GatewayDecision` onto an HTTP status -- it never decides
      // whether an action is authorized.
      if (url.pathname.startsWith('/api/runtime-authority/')) {
        const context = (() => {
          const governanceContext = resolveGovernanceAccessContext(req.headers.authorization, enterprise.configuration);
          return { system: governanceContext.system, ...(governanceContext.organizationId !== undefined ? { tenantId: governanceContext.organizationId } : {}) };
        })();
        const { runtimeAuthority, runtimeAuthorityGateway } = enterprise;

        if (method === 'POST' && url.pathname === '/api/runtime-authority/agents') {
          readRequestBody(req)
            .then((rawBody) => {
              const input = validateRegisterAgentRequestBody(rawBody);
              return runtimeAuthority.registerAgent(context, input, input.actorId);
            })
            .then((agent) => writeJson(res, 201, agent))
            .catch(fail);
          return;
        }

        const agentActionMatch = /^\/api\/runtime-authority\/agents\/([^/]+)\/(suspend|revoke)$/.exec(url.pathname);
        if (method === 'POST' && agentActionMatch?.[1] !== undefined && agentActionMatch[2] !== undefined) {
          const agentId = decodeURIComponent(agentActionMatch[1]);
          const action = agentActionMatch[2];
          readRequestBody(req)
            .then((rawBody) => {
              if (!isPlainObjectBody(rawBody) || typeof rawBody.tenantId !== 'string' || rawBody.tenantId.length === 0) {
                throw EnterpriseHttpErrors.invalidRequest("The request body must include a non-empty 'tenantId'.");
              }
              const control = validateControlRequestBody(rawBody);
              return action === 'suspend' ? runtimeAuthority.suspendAgent(context, rawBody.tenantId, agentId, control) : runtimeAuthority.revokeAgent(context, rawBody.tenantId, agentId, control);
            })
            .then((agent) => writeJson(res, 200, agent))
            .catch(fail);
          return;
        }

        const agentGetMatch = /^\/api\/runtime-authority\/agents\/([^/]+)$/.exec(url.pathname);
        if (method === 'GET' && agentGetMatch?.[1] !== undefined) {
          const agentId = decodeURIComponent(agentGetMatch[1]);
          const tenantId = url.searchParams.get('tenantId');
          if (tenantId === null || tenantId.length === 0) {
            fail(EnterpriseHttpErrors.invalidRequest("Query parameter 'tenantId' is required."));
            return;
          }
          const agent = runtimeAuthority.getAgent(context, tenantId, agentId);
          if (agent === undefined) {
            writeJson(res, 404, { error: { code: 'RUNTIME_AUTHORITY_AGENT_NOT_FOUND', message: `No GovernedAgent '${agentId}' in tenant '${tenantId}'.` } });
            return;
          }
          writeJson(res, 200, agent);
          return;
        }

        if (method === 'POST' && url.pathname === '/api/runtime-authority/runtimes') {
          readRequestBody(req)
            .then((rawBody) => {
              const input = validateCreateRuntimeRequestBody(rawBody);
              return runtimeAuthority.createRuntime(context, input, input.actorId);
            })
            .then((runtime) => writeJson(res, 201, runtime))
            .catch(fail);
          return;
        }

        const runtimeGetMatch = /^\/api\/runtime-authority\/runtimes\/([^/]+)$/.exec(url.pathname);
        if (method === 'GET' && runtimeGetMatch?.[1] !== undefined) {
          const runtimeId = decodeURIComponent(runtimeGetMatch[1]);
          try {
            const runtime = runtimeAuthority.getRuntime(context, runtimeId);
            if (runtime === undefined) {
              writeJson(res, 404, { error: { code: 'RUNTIME_AUTHORITY_RUNTIME_NOT_FOUND', message: `No GovernedRuntime '${runtimeId}'.` } });
              return;
            }
            writeJson(res, 200, runtime);
          } catch (error) {
            fail(error);
          }
          return;
        }

        const runtimeLifecycleMatch = /^\/api\/runtime-authority\/runtimes\/([^/]+)\/(authorize|start)$/.exec(url.pathname);
        if (method === 'POST' && runtimeLifecycleMatch?.[1] !== undefined && runtimeLifecycleMatch[2] !== undefined) {
          const runtimeId = decodeURIComponent(runtimeLifecycleMatch[1]);
          const action = runtimeLifecycleMatch[2];
          readRequestBody(req)
            .then((rawBody) => {
              const { actorId } = validateActorIdRequestBody(rawBody);
              return action === 'authorize' ? runtimeAuthority.authorizeRuntime(context, runtimeId, actorId) : runtimeAuthority.startRuntime(context, runtimeId, actorId);
            })
            .then((runtime) => writeJson(res, 200, runtime))
            .catch(fail);
          return;
        }

        const runtimeControlMatch = /^\/api\/runtime-authority\/runtimes\/([^/]+)\/(pause|resume|isolate|quarantine|terminate)$/.exec(url.pathname);
        if (method === 'POST' && runtimeControlMatch?.[1] !== undefined && runtimeControlMatch[2] !== undefined) {
          const runtimeId = decodeURIComponent(runtimeControlMatch[1]);
          const action = runtimeControlMatch[2];
          readRequestBody(req)
            .then((rawBody) => {
              switch (action) {
                case 'pause':
                  return runtimeAuthority.pause(context, runtimeId, validateControlRequestBody(rawBody));
                case 'resume': {
                  const { control, capabilities } = validateResumeRequestBody(rawBody);
                  return runtimeAuthority.resume(context, runtimeId, control, capabilities);
                }
                case 'isolate':
                  return runtimeAuthority.isolate(context, runtimeId, validateControlRequestBody(rawBody));
                case 'quarantine':
                  return runtimeAuthority.quarantine(context, runtimeId, validateControlRequestBody(rawBody));
                default:
                  return runtimeAuthority.terminate(context, runtimeId, validateControlRequestBody(rawBody));
              }
            })
            .then((outcome) => writeJson(res, 200, outcome))
            .catch(fail);
          return;
        }

        const capabilitiesMatch = /^\/api\/runtime-authority\/runtimes\/([^/]+)\/capabilities$/.exec(url.pathname);
        if (capabilitiesMatch?.[1] !== undefined) {
          const runtimeId = decodeURIComponent(capabilitiesMatch[1]);
          if (method === 'GET') {
            try {
              writeJson(res, 200, { runtimeId, capabilities: runtimeAuthority.listCapabilities(context, runtimeId) });
            } catch (error) {
              fail(error);
            }
            return;
          }
          if (method === 'POST') {
            readRequestBody(req)
              .then((rawBody) => {
                const runtime = runtimeAuthority.getRuntime(context, runtimeId);
                if (runtime === undefined) throw EnterpriseHttpErrors.invalidRequest(`No GovernedRuntime '${runtimeId}'.`);
                const input = validateGrantCapabilityRequestBody(rawBody, runtime.tenantId, runtimeId);
                return runtimeAuthority.grantCapability(context, input);
              })
              .then((grant) => writeJson(res, 201, grant))
              .catch(fail);
            return;
          }
        }

        const capabilityRevokeMatch = /^\/api\/runtime-authority\/runtimes\/([^/]+)\/capabilities\/([^/]+)\/revoke$/.exec(url.pathname);
        if (method === 'POST' && capabilityRevokeMatch?.[1] !== undefined && capabilityRevokeMatch[2] !== undefined) {
          const runtimeId = decodeURIComponent(capabilityRevokeMatch[1]);
          const capability = decodeURIComponent(capabilityRevokeMatch[2]);
          readRequestBody(req)
            .then((rawBody) => runtimeAuthority.revokeCapability(context, runtimeId, capability, validateControlRequestBody(rawBody)))
            .then((grants) => writeJson(res, 200, { runtimeId, capability, grants }))
            .catch(fail);
          return;
        }

        const issueLeaseMatch = /^\/api\/runtime-authority\/runtimes\/([^/]+)\/leases$/.exec(url.pathname);
        if (method === 'POST' && issueLeaseMatch?.[1] !== undefined) {
          const runtimeId = decodeURIComponent(issueLeaseMatch[1]);
          readRequestBody(req)
            .then((rawBody) => {
              const runtime = runtimeAuthority.getRuntime(context, runtimeId);
              if (runtime === undefined) throw EnterpriseHttpErrors.invalidRequest(`No GovernedRuntime '${runtimeId}'.`);
              const input = validateIssueLeaseRequestBody(rawBody, runtime.tenantId, runtimeId);
              return runtimeAuthority.issueLease(context, input);
            })
            .then((lease) => writeJson(res, 201, lease))
            .catch(fail);
          return;
        }

        const leaseActionMatch = /^\/api\/runtime-authority\/leases\/([^/]+)\/(renew|revoke)$/.exec(url.pathname);
        if (method === 'POST' && leaseActionMatch?.[1] !== undefined && leaseActionMatch[2] !== undefined) {
          const leaseId = decodeURIComponent(leaseActionMatch[1]);
          const action = leaseActionMatch[2];
          readRequestBody(req)
            .then((rawBody) => {
              if (action === 'renew') {
                const { actorId } = validateActorIdRequestBody(rawBody);
                return runtimeAuthority.renewLease(context, leaseId, actorId);
              }
              return runtimeAuthority.revokeLease(context, leaseId, validateControlRequestBody(rawBody));
            })
            .then((result) => writeJson(res, 200, result))
            .catch(fail);
          return;
        }

        const activeLeasesMatch = /^\/api\/runtime-authority\/runtimes\/([^/]+)\/leases$/.exec(url.pathname);
        if (method === 'GET' && activeLeasesMatch?.[1] !== undefined) {
          const runtimeId = decodeURIComponent(activeLeasesMatch[1]);
          try {
            writeJson(res, 200, { runtimeId, leases: runtimeAuthority.listActiveLeases(context, runtimeId) });
          } catch (error) {
            fail(error);
          }
          return;
        }

        const evidenceMatch2 = /^\/api\/runtime-authority\/runtimes\/([^/]+)\/evidence$/.exec(url.pathname);
        if (method === 'GET' && evidenceMatch2?.[1] !== undefined) {
          const runtimeId = decodeURIComponent(evidenceMatch2[1]);
          try {
            writeJson(res, 200, { runtimeId, events: runtimeAuthority.listEvidence(context, runtimeId) });
          } catch (error) {
            fail(error);
          }
          return;
        }

        const evidenceVerifyMatch = /^\/api\/runtime-authority\/runtimes\/([^/]+)\/evidence\/verify$/.exec(url.pathname);
        if (method === 'POST' && evidenceVerifyMatch?.[1] !== undefined) {
          const runtimeId = decodeURIComponent(evidenceVerifyMatch[1]);
          try {
            const result = runtimeAuthority.verifyEvidence(context, runtimeId);
            writeJson(res, result.valid ? 200 : 409, result);
          } catch (error) {
            fail(error);
          }
          return;
        }

        // The Enforcement Gateway itself -- reachable over the network,
        // independent of the agent process (mission section 2.2's required
        // execution path). This is the one route a real agent runtime would
        // call before every protected tool action.
        const gatewayMatch = /^\/api\/runtime-authority\/runtimes\/([^/]+)\/gateway\/authorize$/.exec(url.pathname);
        if (method === 'POST' && gatewayMatch?.[1] !== undefined) {
          const runtimeId = decodeURIComponent(gatewayMatch[1]);
          readRequestBody(req)
            .then((rawBody) => {
              const runtime = runtimeAuthority.getRuntime(context, runtimeId);
              if (runtime === undefined) throw EnterpriseHttpErrors.invalidRequest(`No GovernedRuntime '${runtimeId}'.`);
              const request = validateProtectedActionRequestBody(rawBody, runtime.tenantId, runtimeId);
              const decision = runtimeAuthorityGateway.authorizeAction(request);
              writeJson(res, mapGatewayDecisionToHttpStatus(decision), decision);
            })
            .catch(fail);
          return;
        }
      }

      // -- PR-006 Agent Passport Runtime endpoints. Tenant scoping is resolved
      // entirely inside `enterprise.passports` (never here), the same way
      // Evidence and Governance-read routes above defer to their services.
      if (method === 'POST' && url.pathname === '/api/passports') {
        const context = resolveGovernanceAccessContext(req.headers.authorization, enterprise.configuration);
        readRequestBody(req)
          .then((rawBody) => enterprise.passports.issuePassport(context, validateIssuePassportRequestBody(rawBody)))
          .then((result) => writeJson(res, result.created ? 201 : 200, result))
          .catch(fail);
        return;
      }

      if (method === 'GET') {
        const match = matchPassportRoute(url.pathname);
        if (match !== undefined) {
          const context = resolveGovernanceAccessContext(req.headers.authorization, enterprise.configuration);
          if (match.kind === 'passport') {
            enterprise.passports
              .getPassport(context, match.id)
              .then((load) => writeJson(res, load.status === 'complete' ? 200 : 500, load))
              .catch(fail);
            return;
          }
          if (match.kind === 'events') {
            enterprise.passports
              .getEvents(context, match.id)
              .then((events) => writeJson(res, 200, { passportId: match.id, events }))
              .catch(fail);
            return;
          }
          if (match.kind === 'history') {
            enterprise.passports
              .getHistorySummary(context, match.id)
              .then((summary) => writeJson(res, 200, summary))
              .catch(fail);
            return;
          }
        }
      }

      if (method === 'POST') {
        const match = matchPassportActionRoute(url.pathname);
        if (match !== undefined) {
          const context = resolveGovernanceAccessContext(req.headers.authorization, enterprise.configuration);
          const { passports } = enterprise;
          switch (match.action) {
            case 'activate':
              readRequestBody(req)
                .then((rawBody) => passports.activatePassport(context, match.id, validateActorRequestBody(rawBody).actorId))
                .then((passport) => writeJson(res, 200, passport))
                .catch(fail);
              return;
            case 'suspend':
              readRequestBody(req)
                .then((rawBody) => passports.suspendPassport(context, match.id, validateSuspendRequestBody(rawBody)))
                .then((passport) => writeJson(res, 200, passport))
                .catch(fail);
              return;
            case 'reactivate':
              readRequestBody(req)
                .then((rawBody) => passports.reactivatePassport(context, match.id, validateActorRequestBody(rawBody, 'reactivatedBy').actorId))
                .then((passport) => writeJson(res, 200, passport))
                .catch(fail);
              return;
            case 'revoke':
              readRequestBody(req)
                .then((rawBody) => passports.revokePassport(context, match.id, validateRevokeRequestBody(rawBody)))
                .then((passport) => writeJson(res, 200, passport))
                .catch(fail);
              return;
            case 'retire':
              readRequestBody(req)
                .then((rawBody) => passports.retirePassport(context, match.id, validateRetireRequestBody(rawBody)))
                .then((passport) => writeJson(res, 200, passport))
                .catch(fail);
              return;
            case 'verify':
              readRequestBody(req)
                .then((rawBody) => passports.verifyPassport(context, match.id, validateVerifyRequestBody(rawBody).mode))
                .then((result) => writeJson(res, result.valid ? 200 : 409, result))
                .catch(fail);
              return;
            case 'evidence':
              readRequestBody(req)
                .then((rawBody) => {
                  const body = validateLinkEvidenceRequestBody(rawBody);
                  return passports.linkEvidenceBundle(context, match.id, body.reference, body.actorId);
                })
                .then((passport) => writeJson(res, 200, passport))
                .catch(fail);
              return;
            case 'governance':
              readRequestBody(req)
                .then((rawBody) => {
                  const body = validateLinkGovernanceRequestBody(rawBody);
                  return passports.linkGovernanceRecord(context, match.id, body.reference, body.actorId);
                })
                .then((passport) => writeJson(res, 200, passport))
                .catch(fail);
              return;
            case 'views':
              readRequestBody(req)
                .then((rawBody) => {
                  const body = validateBuildViewRequestBody(rawBody);
                  return passports.buildView(context, match.id, body.viewType, body.generatedBy);
                })
                .then((view) => writeJson(res, 201, view))
                .catch(fail);
              return;
          }
        }
      }

      writeJson(res, 404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${url.pathname}.` } });
    }
  };
}

function normalizePathDecodeError(error: unknown): unknown {
  return error instanceof URIError
    ? new EnterpriseHttpError(400, 'INVALID_REQUEST', 'Request path contains malformed percent-encoding.')
    : error;
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

type PassportReadRoute = { readonly kind: 'passport' | 'events' | 'history'; readonly id: string };

/** `GET /api/passports/{id}`, `GET /api/passports/{id}/events`, `GET /api/passports/{id}/history`. */
function matchPassportRoute(pathname: string): PassportReadRoute | undefined {
  const eventsMatch = /^\/api\/passports\/([^/]+)\/events$/.exec(pathname);
  if (eventsMatch?.[1] !== undefined) return { kind: 'events', id: decodeURIComponent(eventsMatch[1]) };
  const historyMatch = /^\/api\/passports\/([^/]+)\/history$/.exec(pathname);
  if (historyMatch?.[1] !== undefined) return { kind: 'history', id: decodeURIComponent(historyMatch[1]) };
  const passportMatch = /^\/api\/passports\/([^/]+)$/.exec(pathname);
  if (passportMatch?.[1] !== undefined) return { kind: 'passport', id: decodeURIComponent(passportMatch[1]) };
  return undefined;
}

type PassportActionRoute = {
  readonly action: 'activate' | 'suspend' | 'reactivate' | 'revoke' | 'retire' | 'verify' | 'evidence' | 'governance' | 'views';
  readonly id: string;
};

const PASSPORT_ACTIONS: readonly PassportActionRoute['action'][] = ['activate', 'suspend', 'reactivate', 'revoke', 'retire', 'verify', 'evidence', 'governance', 'views'];

/** `POST /api/passports/{id}/{action}` for every mutating/derived Passport action. */
function matchPassportActionRoute(pathname: string): PassportActionRoute | undefined {
  const match = /^\/api\/passports\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  const action = match[2];
  if (!(PASSPORT_ACTIONS as readonly string[]).includes(action)) return undefined;
  return { action: action as PassportActionRoute['action'], id: decodeURIComponent(match[1]) };
}
