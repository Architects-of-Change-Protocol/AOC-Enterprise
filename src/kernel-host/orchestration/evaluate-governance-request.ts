import type { AocKernel, KernelClock, KernelIdGenerator } from '../../kernel/index.js';
import { KernelValidationError } from '../../kernel/index.js';
import {
  mapDecisionStatusToHttpStatus,
  toGovernanceEvaluateResponseBody,
  toKernelEvaluationOptions,
  toKernelEvaluationRequest,
  validateGovernanceEvaluateRequestBody,
  type GovernanceEvaluateResponseBody,
} from '../api/governance-evaluate-contract.js';
import { RuntimeHttpErrors } from '../api/runtime-http-errors.js';
import type { RuntimeConfiguration } from '../configuration/runtime-configuration.js';
import type { RuntimeEventPublisher } from '../events/runtime-events.js';
import type { GovernanceStore } from '../persistence/governance-store.js';
import type { RuntimeLogger } from '../telemetry/runtime-logger.js';
import type { RuntimeTelemetry } from '../telemetry/runtime-telemetry.js';

export interface EvaluateGovernanceRequestInput {
  readonly rawBody: unknown;
  readonly authorizationHeader?: string;
}

export interface EvaluateGovernanceRequestDependencies {
  readonly kernel: AocKernel;
  readonly clock: KernelClock;
  /** Used only to fill in a caller-omitted `requestId` on the `KernelEvaluationRequest` itself -- this is the same id generator the Kernel was constructed with. */
  readonly idGenerator: KernelIdGenerator;
  /**
   * A separate id source for the Runtime's own bookkeeping (`RuntimeEvent.eventId`).
   * Deliberately independent of `idGenerator`: event ids are a Runtime-internal
   * concern, and consuming the Kernel's own id generator for them would perturb
   * the id sequence `AocKernel` uses internally for `decisionId`/recognition ids,
   * for no governance-relevant reason.
   */
  readonly eventIdGenerator: KernelIdGenerator;
  readonly store: GovernanceStore;
  readonly eventPublisher: RuntimeEventPublisher;
  readonly telemetry: RuntimeTelemetry;
  readonly logger: RuntimeLogger;
  readonly configuration: RuntimeConfiguration;
}

export interface EvaluateGovernanceRequestOutcome {
  readonly httpStatus: number;
  readonly body: GovernanceEvaluateResponseBody;
}

function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (authorizationHeader === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1];
}

/**
 * Runtime-owned authentication/authorization -- entirely separate from, and
 * prior to, anything the Kernel evaluates. A missing/unknown key is a 401;
 * a recognized key scoped to a different organization than the request
 * names is a 403. Neither check is a governance decision.
 */
function authenticateAndAuthorize(
  authorizationHeader: string | undefined,
  organizationId: string | undefined,
  configuration: RuntimeConfiguration,
): void {
  if (!configuration.features.requireAuthentication) return;

  const token = extractBearerToken(authorizationHeader);
  if (token === undefined) throw RuntimeHttpErrors.authenticationFailed('A Bearer token is required.');

  const matchedKey = configuration.authentication.apiKeys.find((apiKey) => apiKey.key === token);
  if (matchedKey === undefined) throw RuntimeHttpErrors.authenticationFailed('The provided credential is not recognized.');

  if (matchedKey.organizationId !== undefined && organizationId !== undefined && matchedKey.organizationId !== organizationId) {
    throw RuntimeHttpErrors.authorizationFailed(`This credential is not authorized for organization '${organizationId}'.`);
  }
}

/**
 * The full lifecycle the mission specifies: Authentication -> Runtime
 * Validation -> Kernel Request Adapter -> `kernel.evaluate()` -> Persistence
 * -> Audit -> Event Publication -> HTTP Response. Framework-agnostic on
 * purpose -- `adapters/node-http-adapter.ts` is the only piece that knows
 * about `IncomingMessage`/`ServerResponse`; this function (and therefore
 * every test in `__tests__/`) never does.
 */
export async function evaluateGovernanceRequest(
  input: EvaluateGovernanceRequestInput,
  deps: EvaluateGovernanceRequestDependencies,
): Promise<EvaluateGovernanceRequestOutcome> {
  const receivedAt = deps.clock.now();
  const startedAtMs = Date.now();

  const candidateOrganizationId = isPlainObjectWithOrganization(input.rawBody) ? input.rawBody.organization?.id : undefined;
  authenticateAndAuthorize(input.authorizationHeader, candidateOrganizationId, deps.configuration);

  const body = validateGovernanceEvaluateRequestBody(input.rawBody);
  const request = toKernelEvaluationRequest(body, deps.clock, deps.idGenerator);
  const options = toKernelEvaluationOptions(body, deps.configuration.features.traceLevel);

  deps.logger.info('governance.evaluate.requested', {
    requestId: request.requestId,
    ...(request.correlationId !== undefined ? { correlationId: request.correlationId } : {}),
    route: 'POST /api/governance/evaluate',
  });

  if (deps.configuration.eventPublishing.enabled) {
    const requestedEvent = {
      eventId: deps.eventIdGenerator.nextId('runtime-event'),
      type: 'GovernanceEvaluationRequested' as const,
      occurredAt: receivedAt,
      requestId: request.requestId,
      ...(request.correlationId !== undefined ? { correlationId: request.correlationId } : {}),
    };
    await deps.eventPublisher.publish(requestedEvent);
    await deps.store.appendRuntimeEvent({
      eventId: requestedEvent.eventId,
      eventType: requestedEvent.type,
      requestId: requestedEvent.requestId,
      ...(requestedEvent.correlationId !== undefined ? { correlationId: requestedEvent.correlationId } : {}),
      occurredAt: requestedEvent.occurredAt,
      payload: {},
    });
  }

  let result;
  try {
    result = await deps.kernel.evaluate(request, options);
  } catch (error) {
    if (error instanceof KernelValidationError) {
      throw RuntimeHttpErrors.invalidRequest(error.message);
    }
    deps.telemetry.recordRuntimeFailure();
    deps.logger.error('governance.evaluate.kernel_failure', { requestId: request.requestId, route: 'POST /api/governance/evaluate' });
    throw RuntimeHttpErrors.infrastructureFailure('The Kernel could not complete evaluation.');
  }

  const durationMs = Date.now() - startedAtMs;
  deps.telemetry.recordEvaluation(result.status, durationMs);

  let persisted;
  try {
    persisted = await deps.store.persistEvaluation({ request, result, receivedAt });
  } catch {
    deps.telemetry.recordPersistenceFailure();
    throw RuntimeHttpErrors.infrastructureFailure('The evaluation could not be persisted.');
  }

  if (persisted.outcome === 'conflict') {
    throw RuntimeHttpErrors.concurrencyConflict(
      `requestId '${request.requestId}' was already submitted with a different payload; a request id must uniquely identify one governance request.`,
    );
  }

  const finalResult = persisted.outcome === 'idempotent_replay' ? await rehydrateReplayedResult(persisted.evaluation.decisionId, result, deps.store) : result;

  deps.logger.info('governance.audit.decision', {
    requestId: finalResult.requestId,
    decisionId: finalResult.decisionId,
    status: finalResult.status,
    durationMs,
    kernelVersion: finalResult.kernelVersion,
    runtimeVersion: deps.configuration.runtimeVersion,
    ...(finalResult.correlationId !== undefined ? { correlationId: finalResult.correlationId } : {}),
  });

  if (deps.configuration.eventPublishing.enabled) {
    const completionEvent = {
      eventId: deps.eventIdGenerator.nextId('runtime-event'),
      type: eventTypeForStatus(finalResult.status),
      occurredAt: finalResult.evaluatedAt,
      requestId: finalResult.requestId,
      decisionId: finalResult.decisionId,
      status: finalResult.status,
      reasonCodes: finalResult.reasonCodes,
      kernelVersion: finalResult.kernelVersion,
      ...(finalResult.correlationId !== undefined ? { correlationId: finalResult.correlationId } : {}),
    };
    await deps.eventPublisher.publish(completionEvent);
    await deps.store.appendRuntimeEvent({
      eventId: completionEvent.eventId,
      eventType: completionEvent.type,
      requestId: completionEvent.requestId,
      decisionId: completionEvent.decisionId,
      ...(completionEvent.correlationId !== undefined ? { correlationId: completionEvent.correlationId } : {}),
      occurredAt: completionEvent.occurredAt,
      payload: { status: completionEvent.status, reasonCodes: completionEvent.reasonCodes },
    });
  }

  return {
    httpStatus: mapDecisionStatusToHttpStatus(finalResult.status),
    body: toGovernanceEvaluateResponseBody(finalResult),
  };
}

function eventTypeForStatus(status: GovernanceEvaluateResponseBody['status']) {
  switch (status) {
    case 'denied':
      return 'GovernanceEvaluationDenied' as const;
    case 'approval_required':
      return 'GovernanceEvaluationApprovalRequired' as const;
    case 'allowed':
      return 'GovernanceEvaluationCompleted' as const;
    case 'indeterminate':
      return 'GovernanceEvaluationFailed' as const;
  }
}

function isPlainObjectWithOrganization(value: unknown): value is { organization?: { id?: string } } {
  return typeof value === 'object' && value !== null;
}

/** An idempotent replay reuses the originally stored evaluation's identity/summary rather than the (structurally identical) newly-computed one, and reconstructs its trace from `GovernanceTraces` since the store's evaluation record does not carry it inline. */
async function rehydrateReplayedResult(decisionId: string, freshResult: Awaited<ReturnType<AocKernel['evaluate']>>, store: GovernanceStore) {
  const [evaluation, trace] = await Promise.all([store.getEvaluationByDecisionId(decisionId), store.getTraceByDecisionId(decisionId)]);
  if (evaluation === undefined || trace === undefined) return freshResult;
  return {
    ...freshResult,
    decisionId: evaluation.decisionId,
    status: evaluation.status,
    reasonCodes: evaluation.reasonCodes,
    summary: evaluation.summary,
    kernelVersion: evaluation.kernelVersion,
    evaluatedAt: evaluation.evaluatedAt,
    trace: trace.trace,
  };
}
