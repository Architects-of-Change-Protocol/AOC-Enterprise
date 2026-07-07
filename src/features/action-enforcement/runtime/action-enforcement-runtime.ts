import type { EnforcementRecognitionIntegration } from '../domain/enforcement-context.js';
import type { EnforcementAdapter } from '../domain/enforcement-adapter.js';
import type { EnforcementDecision } from '../domain/enforcement-decision.js';
import type { EnforcementEvent } from '../domain/enforcement-event.js';
import type { EnforcementOutcome } from '../domain/enforcement-outcome.js';
import type { EnforcementProof } from '../domain/enforcement-proof.js';
import type { EnforcementRequest } from '../domain/enforcement-request.js';
import type { EnforcementViolation } from '../domain/enforcement-violation.js';
import type { EnforcementPolicy } from '../domain/enforcement-verification.js';
import type { ExecutionResult } from '../domain/execution-result.js';
import { AdapterRegistry } from '../services/adapter-registry.js';
import { EnforcementDecisionService } from '../services/enforcement-decision-service.js';
import { EnforcementLedger } from '../services/enforcement-ledger.js';
import { EnforcementPolicyEvaluator } from '../services/enforcement-policy-evaluator.js';
import { EnforcementPreflightService } from '../services/enforcement-preflight-service.js';
import { EnforcementProofService } from '../services/enforcement-proof-service.js';
import { EnforcementRequestService, type CreateEnforcementRequestInput } from '../services/enforcement-request-service.js';
import { EnforcementResultService } from '../services/enforcement-result-service.js';
import { EnforcementStore } from '../services/enforcement-store.js';
import { GuardedExecutionService } from '../services/guarded-execution-service.js';
import { IdempotencyService } from '../services/idempotency-service.js';
import { SideEffectLedger } from '../services/side-effect-ledger.js';
import type { EnforcementRuntimeContext } from './enforcement-runtime-context.js';

export interface ActionEnforcementRuntimeOptions {
  /** When true, every enforcement request is denied regardless of recognition. Defaults to false. */
  readonly emergencyDeny?: boolean;
  /** Whether a previously *failed* execution under the same idempotency key may be retried. Defaults to true. */
  readonly allowIdempotencyRetryAfterFailure?: boolean;
  readonly policies?: readonly EnforcementPolicy[];
}

/**
 * Composes the full Action Enforcement Gateway: request intake, Recognition
 * Runtime preflight, the deterministic policy chain, guarded execution, side
 * effect tracking, idempotency, and the proof/event ledgers. This is the
 * single object application code (and the SDK guards) should depend on.
 */
export class ActionEnforcementRuntime {
  readonly store: EnforcementStore;
  readonly ledger: EnforcementLedger;
  readonly sideEffectLedger: SideEffectLedger;
  readonly requestService: EnforcementRequestService;
  readonly decisionService: EnforcementDecisionService;
  readonly policyEvaluator: EnforcementPolicyEvaluator;
  readonly adapterRegistry: AdapterRegistry;
  readonly idempotencyService: IdempotencyService;
  readonly resultService: EnforcementResultService;
  readonly proofService: EnforcementProofService;
  readonly preflightService: EnforcementPreflightService;
  readonly guardedExecutionService: GuardedExecutionService;

  private emergencyDeny: boolean;

  constructor(
    private readonly ctx: EnforcementRuntimeContext,
    recognitionIntegration: EnforcementRecognitionIntegration,
    options: ActionEnforcementRuntimeOptions = {},
  ) {
    this.emergencyDeny = options.emergencyDeny ?? false;

    this.store = new EnforcementStore();
    this.ledger = new EnforcementLedger(ctx, this.store);
    this.sideEffectLedger = new SideEffectLedger(ctx, this.store, this.ledger);
    this.requestService = new EnforcementRequestService(ctx, this.store, this.ledger, this.sideEffectLedger);
    this.decisionService = new EnforcementDecisionService(ctx, this.store);
    this.policyEvaluator = new EnforcementPolicyEvaluator(options.policies);
    this.adapterRegistry = new AdapterRegistry(this.store);
    this.idempotencyService = new IdempotencyService(ctx, { allowRetryAfterFailure: options.allowIdempotencyRetryAfterFailure ?? true });
    this.resultService = new EnforcementResultService(ctx, this.store);
    this.proofService = new EnforcementProofService(ctx, this.store);
    this.preflightService = new EnforcementPreflightService(
      ctx,
      this.store,
      this.ledger,
      this.decisionService,
      this.policyEvaluator,
      this.adapterRegistry,
      this.idempotencyService,
      recognitionIntegration,
      () => this.emergencyDeny,
    );
    this.guardedExecutionService = new GuardedExecutionService(
      ctx,
      this.store,
      this.ledger,
      this.preflightService,
      this.resultService,
      this.proofService,
      this.sideEffectLedger,
      this.idempotencyService,
    );
  }

  setEmergencyDeny(active: boolean): void {
    this.emergencyDeny = active;
  }

  isEmergencyDenyActive(): boolean {
    return this.emergencyDeny;
  }

  createEnforcementRequest(input: CreateEnforcementRequestInput): EnforcementRequest {
    return this.requestService.createEnforcementRequest(input);
  }

  getEnforcementRequest(enforcementRequestId: string): EnforcementRequest | undefined {
    return this.requestService.getEnforcementRequest(enforcementRequestId);
  }

  /** Runs preflight only. Never invokes an executor -- always safe to call. */
  preflight(request: EnforcementRequest): EnforcementDecision {
    return this.preflightService.preflight(request);
  }

  /** Runs preflight, then invokes `execute` exactly once, and only when preflight allows it. */
  async enforce<T>(request: EnforcementRequest, execute: () => Promise<T> | T): Promise<EnforcementOutcome<T>> {
    return this.guardedExecutionService.run(request, execute);
  }

  registerAdapter(adapter: EnforcementAdapter): EnforcementAdapter {
    return this.adapterRegistry.register(adapter);
  }

  getEnforcementProof(enforcementDecisionId: string): EnforcementProof | undefined {
    return this.proofService.getProofByDecisionId(enforcementDecisionId);
  }

  getEnforcementTrail(enforcementRequestId: string): readonly EnforcementEvent[] {
    return this.ledger.getTrailByRequest(enforcementRequestId);
  }

  getExecutionResult(executionResultId: string): ExecutionResult | undefined {
    return this.resultService.getResult(executionResultId);
  }

  getViolations(enforcementRequestId: string): readonly EnforcementViolation[] {
    return this.store.getViolationsByRequest(enforcementRequestId);
  }
}

export function createActionEnforcementRuntime(
  ctx: EnforcementRuntimeContext,
  recognitionIntegration: EnforcementRecognitionIntegration,
  options?: ActionEnforcementRuntimeOptions,
): ActionEnforcementRuntime {
  return new ActionEnforcementRuntime(ctx, recognitionIntegration, options);
}
