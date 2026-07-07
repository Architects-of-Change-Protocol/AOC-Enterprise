import type { EnforcementOutcome } from '../domain/enforcement-outcome.js';
import type { EnforcementPolicyEvaluationInput } from '../domain/enforcement-request.js';
import type { AocGuard, GuardActionRequestInput } from './aoc-guard.js';

export interface ApiHandlerConfig<TReq, TRes> {
  readonly action: string;
  readonly capability?: string;
  readonly adapterId?: string;

  readonly trustDomainFromRequest: (req: TReq) => string;
  readonly actorFromRequest: (req: TReq) => string;
  readonly principalActorFromRequest?: (req: TReq) => string | undefined;
  readonly resourceScopeFromRequest: (req: TReq) => string;
  readonly idempotencyKeyFromRequest?: (req: TReq) => string | undefined;
  /** Derives the optional Domain Policy Pack Runtime preflight context from the framework request. Omit when no policy pack integration is configured, or when this route needs none. */
  readonly policyEvaluationInputFromRequest?: (req: TReq) => EnforcementPolicyEvaluationInput | undefined;

  readonly handler: (req: TReq) => Promise<TRes> | TRes;
  readonly throwOnBlocked?: boolean;
}

export type ApiHandlerResult<TRes> =
  | { readonly blocked: false; readonly value: TRes; readonly outcome: EnforcementOutcome<TRes> }
  | { readonly blocked: true; readonly outcome: EnforcementOutcome<TRes> };

export class ApiHandlerBlockedError extends Error {
  constructor(public readonly outcome: EnforcementOutcome) {
    super(`API handler blocked by AOC enforcement: ${outcome.decision.reasonCode}`);
    this.name = 'ApiHandlerBlockedError';
  }
}

/**
 * Guards an API route handler. The handler never runs unless enforcement
 * returns execute_allowed. Framework-agnostic by design: the wrapped function
 * returns a small discriminated result the caller adapts to its own
 * Request/Response types in one line, instead of this feature assuming a
 * particular web framework.
 */
export class ApiHandlerGuard {
  constructor(private readonly guard: AocGuard) {}

  wrap<TReq, TRes>(config: ApiHandlerConfig<TReq, TRes>): (req: TReq) => Promise<ApiHandlerResult<TRes>> {
    return async (req: TReq): Promise<ApiHandlerResult<TRes>> => {
      const principalActorId = config.principalActorFromRequest?.(req);
      const idempotencyKey = config.idempotencyKeyFromRequest?.(req);
      const policyEvaluationInput = config.policyEvaluationInputFromRequest?.(req);

      const guardInput: GuardActionRequestInput = {
        actorId: config.actorFromRequest(req),
        trustDomainId: config.trustDomainFromRequest(req),
        action: config.action,
        resourceScope: config.resourceScopeFromRequest(req),
        targetType: 'api_handler',
        targetName: config.action,
        ...(config.adapterId !== undefined ? { adapterId: config.adapterId } : {}),
        ...(config.capability !== undefined ? { capability: config.capability } : {}),
        ...(principalActorId !== undefined ? { principalActorId } : {}),
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
        ...(policyEvaluationInput !== undefined ? { policyEvaluationInput } : {}),
      };

      const outcome = await this.guard.enforce<TRes>(guardInput, () => config.handler(req));

      if (outcome.decision.allowedToExecute && outcome.result.executed) {
        return { blocked: false, value: outcome.result.value as TRes, outcome };
      }

      if (config.throwOnBlocked) {
        throw new ApiHandlerBlockedError(outcome);
      }
      return { blocked: true, outcome };
    };
  }
}

export function createApiHandlerGuard(guard: AocGuard): ApiHandlerGuard {
  return new ApiHandlerGuard(guard);
}
