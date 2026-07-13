import { EnterpriseHostApiError, EnterpriseHostNetworkError, EnterpriseHostTimeoutError } from './errors.js';
import type {
  AgentPassport,
  AssuranceAssessment,
  AssuranceSignalRequest,
  AssuranceVerificationResult,
  CreateAssessmentRequest,
  EnterpriseHostClientOptions,
  EvidenceBuildRequest,
  EvidenceBundleResponse,
  EvidenceVerificationResult,
  FetchLike,
  GovernanceEvaluateRequest,
  GovernanceEvaluateResponse,
  GovernanceRecord,
  GovernanceVerificationResult,
  HealthReport,
  IssuePassportRequest,
  LivenessResponse,
  ManualReviewRequest,
  PassportVerificationResult,
  PassportVerifyMode,
  ReadinessResponse,
  ReassessRequest,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

interface AbortSignalTimeoutFactory {
  timeout(ms: number): unknown;
}

/** The Enterprise Host HTTP client. One method per public endpoint; no business logic, no local decisions. */
export interface EnterpriseHostClient {
  // health
  live(): Promise<LivenessResponse>;
  ready(): Promise<ReadinessResponse>;
  health(): Promise<HealthReport>;

  // governance
  evaluate(request: GovernanceEvaluateRequest, options?: { readonly idempotencyKey?: string }): Promise<GovernanceEvaluateResponse>;
  getEvaluation(evaluationId: string): Promise<GovernanceRecord>;
  verifyEvaluation(evaluationId: string): Promise<GovernanceVerificationResult>;
  getDecision(decisionId: string): Promise<GovernanceRecord>;
  getRequest(requestId: string): Promise<GovernanceRecord>;

  // evidence
  buildEvidence(request: EvidenceBuildRequest): Promise<EvidenceBundleResponse>;
  verifyEvidence(bundleId: string): Promise<EvidenceVerificationResult>;
  getEvidence(bundleId: string): Promise<EvidenceBundleResponse>;

  // passports
  issuePassport(request: IssuePassportRequest): Promise<unknown>;
  getPassport(passportId: string): Promise<unknown>;
  getPassportEvents(passportId: string): Promise<unknown>;
  getPassportHistory(passportId: string): Promise<unknown>;
  activatePassport(passportId: string, actorId: string): Promise<AgentPassport>;
  suspendPassport(passportId: string, body: Readonly<Record<string, unknown>>): Promise<AgentPassport>;
  reactivatePassport(passportId: string, actorId: string): Promise<AgentPassport>;
  revokePassport(passportId: string, body: Readonly<Record<string, unknown>>): Promise<AgentPassport>;
  retirePassport(passportId: string, body: Readonly<Record<string, unknown>>): Promise<AgentPassport>;
  verifyPassport(passportId: string, mode?: PassportVerifyMode): Promise<PassportVerificationResult>;
  linkPassportEvidence(passportId: string, body: Readonly<Record<string, unknown>>): Promise<AgentPassport>;
  linkPassportGovernance(passportId: string, body: Readonly<Record<string, unknown>>): Promise<AgentPassport>;
  buildPassportView(passportId: string, body: Readonly<Record<string, unknown>>): Promise<unknown>;

  // assurance
  createAssessment(request: CreateAssessmentRequest): Promise<AssuranceAssessment>;
  evaluateAssessment(assessmentId: string, options?: { readonly complete?: boolean }): Promise<AssuranceAssessment>;
  verifyAssessment(assessmentId: string): Promise<AssuranceVerificationResult>;
  getAssessment(assessmentId: string): Promise<AssuranceAssessment>;
  listFindings(assessmentId: string): Promise<unknown>;
  appendFindingEvent(findingId: string, body: Readonly<Record<string, unknown>>): Promise<unknown>;
  recordManualReview(request: ManualReviewRequest): Promise<unknown>;
  processSignal(request: AssuranceSignalRequest): Promise<unknown>;
  getContinuousState(subjectId: string, options?: { readonly frameworkId?: string; readonly frameworkVersion?: string }): Promise<unknown>;
  requestReassessment(subjectId: string, request: ReassessRequest): Promise<AssuranceAssessment>;
}

function resolveFetch(options: EnterpriseHostClientOptions): FetchLike {
  if (options.fetch !== undefined) return options.fetch;
  const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
  if (globalFetch === undefined) {
    throw new TypeError('No fetch implementation available: pass options.fetch or run on Node.js >= 18.');
  }
  return globalFetch;
}

function timeoutSignal(ms: number): unknown {
  const abortSignal = (globalThis as { AbortSignal?: AbortSignalTimeoutFactory }).AbortSignal;
  return abortSignal?.timeout !== undefined ? abortSignal.timeout(ms) : undefined;
}

function isTimeoutAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'TimeoutError';
}

function extractEnvelope(body: unknown): { code: string; message: string; details?: readonly string[] } | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const errorField = (body as { error?: unknown }).error;
  if (typeof errorField !== 'object' || errorField === null) return undefined;
  const { code, message, details } = errorField as { code?: unknown; message?: unknown; details?: unknown };
  if (typeof code !== 'string' || typeof message !== 'string') return undefined;
  return {
    code,
    message,
    ...(Array.isArray(details) && details.every((entry) => typeof entry === 'string') ? { details: details as readonly string[] } : {}),
  };
}

/**
 * Creates a typed HTTP client for the AOC Enterprise Host v1 API.
 *
 * The client performs no retries: retry policy belongs to the caller (see
 * README "Retries" for which operations are safe to retry and how to use
 * the evaluate `idempotencyKey`).
 */
export function createEnterpriseHostClient(options: EnterpriseHostClientOptions): EnterpriseHostClient {
  const fetchImpl = resolveFetch(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown, extraHeaders?: Readonly<Record<string, string>>): Promise<T> {
    const route = `${method} ${path}`;
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.apiKey !== undefined ? { authorization: `Bearer ${options.apiKey}` } : {}),
      ...extraHeaders,
    };

    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: timeoutSignal(timeoutMs),
      });
    } catch (error) {
      if (isTimeoutAbort(error)) throw new EnterpriseHostTimeoutError(timeoutMs, route);
      throw new EnterpriseHostNetworkError(route, error);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (error) {
      throw new EnterpriseHostNetworkError(route, error);
    }

    if (response.status >= 400) {
      const envelope = extractEnvelope(parsed);
      throw new EnterpriseHostApiError(
        response.status,
        envelope?.code ?? 'UNKNOWN',
        envelope?.message ?? `Request to '${route}' failed with status ${response.status}.`,
        parsed,
        envelope?.details,
      );
    }
    return parsed as T;
  }

  const encode = encodeURIComponent;

  return {
    live: () => request('GET', '/live'),
    ready: () => request('GET', '/ready'),
    health: () => request('GET', '/health'),

    evaluate: (body, callOptions) =>
      request('POST', '/api/governance/evaluate', body, callOptions?.idempotencyKey !== undefined ? { 'idempotency-key': callOptions.idempotencyKey } : undefined),
    getEvaluation: (evaluationId) => request('GET', `/api/governance/evaluations/${encode(evaluationId)}`),
    verifyEvaluation: (evaluationId) => request('GET', `/api/governance/evaluations/${encode(evaluationId)}/verify`),
    getDecision: (decisionId) => request('GET', `/api/governance/decisions/${encode(decisionId)}`),
    getRequest: (requestId) => request('GET', `/api/governance/requests/${encode(requestId)}`),

    buildEvidence: (body) => request('POST', '/api/evidence/build', body),
    verifyEvidence: (bundleId) => request('POST', '/api/evidence/verify', { bundleId }),
    getEvidence: (bundleId) => request('GET', `/api/evidence/${encode(bundleId)}`),

    issuePassport: (body) => request('POST', '/api/passports', body),
    getPassport: (passportId) => request('GET', `/api/passports/${encode(passportId)}`),
    getPassportEvents: (passportId) => request('GET', `/api/passports/${encode(passportId)}/events`),
    getPassportHistory: (passportId) => request('GET', `/api/passports/${encode(passportId)}/history`),
    activatePassport: (passportId, actorId) => request('POST', `/api/passports/${encode(passportId)}/activate`, { actorId }),
    suspendPassport: (passportId, body) => request('POST', `/api/passports/${encode(passportId)}/suspend`, body),
    // The reactivate route validates the body field as `reactivatedBy`, not `actorId`.
    reactivatePassport: (passportId, actorId) => request('POST', `/api/passports/${encode(passportId)}/reactivate`, { reactivatedBy: actorId }),
    revokePassport: (passportId, body) => request('POST', `/api/passports/${encode(passportId)}/revoke`, body),
    retirePassport: (passportId, body) => request('POST', `/api/passports/${encode(passportId)}/retire`, body),
    verifyPassport: (passportId, mode) => request('POST', `/api/passports/${encode(passportId)}/verify`, mode !== undefined ? { mode } : {}),
    linkPassportEvidence: (passportId, body) => request('POST', `/api/passports/${encode(passportId)}/evidence`, body),
    linkPassportGovernance: (passportId, body) => request('POST', `/api/passports/${encode(passportId)}/governance`, body),
    buildPassportView: (passportId, body) => request('POST', `/api/passports/${encode(passportId)}/views`, body),

    createAssessment: (body) => request('POST', '/api/assurance/assessments', body),
    evaluateAssessment: (assessmentId, callOptions) =>
      request('POST', `/api/assurance/assessments/${encode(assessmentId)}/evaluate`, callOptions?.complete !== undefined ? { complete: callOptions.complete } : {}),
    verifyAssessment: (assessmentId) => request('POST', `/api/assurance/assessments/${encode(assessmentId)}/verify`),
    getAssessment: (assessmentId) => request('GET', `/api/assurance/assessments/${encode(assessmentId)}`),
    listFindings: (assessmentId) => request('GET', `/api/assurance/assessments/${encode(assessmentId)}/findings`),
    appendFindingEvent: (findingId, body) => request('POST', `/api/assurance/findings/${encode(findingId)}/events`, body),
    recordManualReview: (body) => request('POST', '/api/assurance/manual-reviews', body),
    processSignal: (body) => request('POST', '/api/assurance/signals', body),
    getContinuousState: (subjectId, callOptions) => {
      const params = [
        ...(callOptions?.frameworkId !== undefined ? [`frameworkId=${encode(callOptions.frameworkId)}`] : []),
        ...(callOptions?.frameworkVersion !== undefined ? [`frameworkVersion=${encode(callOptions.frameworkVersion)}`] : []),
      ];
      const query = params.length > 0 ? `?${params.join('&')}` : '';
      return request('GET', `/api/assurance/subjects/${encode(subjectId)}/state${query}`);
    },
    requestReassessment: (subjectId, body) => request('POST', `/api/assurance/subjects/${encode(subjectId)}/reassess`, body),
  };
}
