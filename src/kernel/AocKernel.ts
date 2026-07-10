import { randomUUID } from 'crypto';

import type { EnforcementAdapter } from '../features/action-enforcement/domain/enforcement-adapter.js';
import type { EnforcementDecision } from '../features/action-enforcement/domain/enforcement-decision.js';
import type { EnforcementPolicy } from '../features/action-enforcement/domain/enforcement-verification.js';
import {
  createActionEnforcementRuntime,
  type ActionEnforcementRuntime,
  type ActionEnforcementRuntimeOptions,
} from '../features/action-enforcement/runtime/action-enforcement-runtime.js';
import type { EnforcementRuntimeContext } from '../features/action-enforcement/runtime/enforcement-runtime-context.js';
import { PostExecutionRecordMissingError } from '../features/action-enforcement/runtime/enforcement-runtime-errors.js';
import { AocGuard, createAocGuard } from '../features/action-enforcement/sdk/aoc-guard.js';
import type { KernelEnforcementResult } from './contracts/kernel-enforcement-result.js';
import type { KernelEvaluationOptions } from './contracts/kernel-options.js';
import type { KernelClock, KernelIdGenerator, PolicyPackProvider, RecognitionProvider } from './contracts/ports.js';
import type { KernelEvaluationRequest } from './contracts/kernel-request.js';
import type { KernelEvaluationResult } from './contracts/kernel-result.js';
import { KernelConfigurationError, KernelDependencyError, KernelExecutionError } from './errors/kernel-errors.js';
import { assertKernelInvariants, cloneKernelEvaluationRequest } from './orchestration/kernel-invariants.js';
import { toGuardActionRequestInput, validateKernelEvaluationRequest } from './orchestration/request-adapter.js';
import { toKernelEnforcementResult, toKernelEvaluationResult } from './orchestration/result-adapter.js';
import { AOC_KERNEL_REASON_CODES } from './reason-codes/reason-codes.js';
import { AOC_KERNEL_VERSION } from './versioning.js';

export interface AocKernelOptions {
  /** Real, required dependency: bridges the kernel onto a concrete recognition engine (in every real wiring today, Recognition Runtime composed with Authority Graph, Approval Runtime, and External Agent Handshake -- see `bridgeRecognitionRuntime` in action-enforcement's fixtures). */
  readonly recognitionProvider: RecognitionProvider;
  /** Optional Domain Policy Pack Runtime integration. Omitted -> behavior is identical to no policy pack existing at all. */
  readonly policyPackProvider?: PolicyPackProvider;
  /** Defaults to a real-time clock. Tests should supply a deterministic one (see `AOC_KERNEL_INTEGRATION_GUIDE.md`). */
  readonly clock?: KernelClock;
  /** Defaults to `crypto.randomUUID()`-backed ids. Tests should supply a deterministic sequential generator. */
  readonly idGenerator?: KernelIdGenerator;
  readonly emergencyDeny?: boolean;
  readonly allowIdempotencyRetryAfterFailure?: boolean;
  /** Overrides the wrapped engine's default 13-policy enforcement chain. Only pass this when you have a specific, tested replacement chain -- see `createDefaultEnforcementPolicyChain`. */
  readonly policies?: readonly EnforcementPolicy[];
  /** Adapters registered up front so `AdapterPermissionPolicy` can enforce their allow/deny lists -- without this, a request naming `target.adapterId` would find no registered adapter and pass with `NO_ADAPTER_REGISTERED`, which is more permissive than a directly-configured `ActionEnforcementRuntime`. Use `registerAdapter()` to add more after construction. */
  readonly adapters?: readonly EnforcementAdapter[];
}

function createRealClock(): KernelClock {
  return { now: () => new Date().toISOString() };
}

function createRealIdGenerator(): KernelIdGenerator {
  return { nextId: (prefix: string) => `${prefix}-${randomUUID()}` };
}

/**
 * Canonical AOC Enterprise Kernel entry point. Wraps the existing, unmodified
 * `ActionEnforcementRuntime`/`AocGuard` engine (recognition, authority,
 * approval, evidence, external handshake, and domain policy pack are all
 * reached transitively through the injected `RecognitionProvider`) and
 * exposes it through a stable, versioned contract.
 *
 * `evaluate()` is the canonical operation: it only ever evaluates, mapping
 * onto `AocGuard.preflight()`, and never invokes anything. `enforce()` is a
 * documented higher-level operation that also invokes a caller-supplied
 * adapter as a real side effect when (and only when) evaluation allows it --
 * see `docs/kernel/AOC_KERNEL_CURRENT_EXECUTION_MODEL.md` sec. 19 for why
 * these are kept distinct rather than collapsed under one name.
 */
export class AocKernel {
  static readonly version = AOC_KERNEL_VERSION;

  private readonly runtime: ActionEnforcementRuntime;
  private readonly guard: AocGuard;
  private readonly ctx: EnforcementRuntimeContext;

  constructor(options: AocKernelOptions) {
    if (options.recognitionProvider === undefined) {
      throw new KernelConfigurationError('AocKernel requires a recognitionProvider.');
    }

    this.ctx = {
      clock: options.clock ?? createRealClock(),
      ids: options.idGenerator ?? createRealIdGenerator(),
    };

    const runtimeOptions: ActionEnforcementRuntimeOptions = {
      ...(options.emergencyDeny !== undefined ? { emergencyDeny: options.emergencyDeny } : {}),
      ...(options.allowIdempotencyRetryAfterFailure !== undefined ? { allowIdempotencyRetryAfterFailure: options.allowIdempotencyRetryAfterFailure } : {}),
      ...(options.policies !== undefined ? { policies: options.policies } : {}),
      ...(options.policyPackProvider !== undefined ? { policyPackIntegration: options.policyPackProvider } : {}),
    };

    this.runtime = createActionEnforcementRuntime(this.ctx, options.recognitionProvider, runtimeOptions);
    this.guard = createAocGuard(this.runtime);

    for (const adapter of options.adapters ?? []) {
      this.runtime.registerAdapter(adapter);
    }
  }

  /** Registers an adapter after construction -- mirrors `ActionEnforcementRuntime.registerAdapter`, for callers that discover adapters dynamically rather than up front via `AocKernelOptions.adapters`. */
  registerAdapter(adapter: EnforcementAdapter): EnforcementAdapter {
    return this.runtime.registerAdapter(adapter);
  }

  private buildIndeterminateResult(request: KernelEvaluationRequest, error: unknown): KernelEvaluationResult {
    const message = error instanceof Error ? error.message : String(error);
    const decisionId = this.ctx.ids.nextId('kernel-indeterminate');
    return {
      requestId: request.requestId,
      decisionId,
      status: 'indeterminate',
      reasonCodes: [AOC_KERNEL_REASON_CODES.KERNEL_INDETERMINATE],
      summary: `Kernel evaluation could not complete: ${message}`,
      recognition: { performed: false },
      authority: { performed: false },
      policies: [],
      approval: { performed: false, status: 'not_applicable' },
      evidence: [],
      trace: { steps: [], decisionId, kernelVersion: AOC_KERNEL_VERSION },
      evaluatedAt: this.ctx.clock.now(),
      kernelVersion: AOC_KERNEL_VERSION,
      ...(request.correlationId !== undefined ? { correlationId: request.correlationId } : {}),
    };
  }

  /**
   * Evaluates whether an action may proceed. Never invokes anything, and
   * never throws for a governance outcome -- an unexpected failure in the
   * configured `RecognitionProvider` (a real gap in the wrapped engine
   * itself, see `AOC_KERNEL_CURRENT_EXECUTION_MODEL.md` sec. 14) is caught
   * here and surfaced as `status: 'indeterminate'` instead.
   */
  async evaluate(request: KernelEvaluationRequest, options?: KernelEvaluationOptions): Promise<KernelEvaluationResult> {
    validateKernelEvaluationRequest(request);
    const requestSnapshot = cloneKernelEvaluationRequest(request);

    let decision: EnforcementDecision;
    try {
      decision = this.guard.preflight(toGuardActionRequestInput(request, options));
    } catch (error) {
      return this.buildIndeterminateResult(request, new KernelDependencyError('recognitionProvider failed during evaluation', error));
    }

    const result = toKernelEvaluationResult(request.requestId, decision, options, request.correlationId);
    assertKernelInvariants(request, requestSnapshot, result);
    return result;
  }

  /**
   * Preflights the request exactly as `evaluate()` does, then invokes
   * `executor` exactly once, and only when the evaluation allows it --
   * identical semantics to `AocGuard.enforce()`, which this wraps directly.
   *
   * `guard.enforce()` can throw from exactly two places (see
   * `AOC_KERNEL_CURRENT_EXECUTION_MODEL.md` sec. 14): an uncaught
   * `recognitionProvider` failure during preflight (before `executor` ever
   * runs -- safe to report as `not_executed`), or a
   * `PostExecutionRecordMissingError` raised *after* `executor` has already
   * run. Only the former is reported as `status: 'indeterminate'` /
   * `execution.executed: false`; the latter is rethrown as a
   * `KernelExecutionError` rather than risk telling a caller it is safe to
   * retry a side effect that may have already happened.
   */
  async enforce<T>(request: KernelEvaluationRequest, executor: () => Promise<T> | T, options?: KernelEvaluationOptions): Promise<KernelEnforcementResult<T>> {
    validateKernelEvaluationRequest(request);
    const requestSnapshot = cloneKernelEvaluationRequest(request);

    let outcome;
    try {
      outcome = await this.guard.enforce(toGuardActionRequestInput(request, options), executor);
    } catch (error) {
      if (error instanceof PostExecutionRecordMissingError) {
        throw new KernelExecutionError(
          'A post-execution invariant was violated after the executor may have already run; the execution outcome cannot be safely reported as not executed.',
          error,
        );
      }
      const indeterminate = this.buildIndeterminateResult(request, new KernelDependencyError('recognitionProvider failed during enforcement', error));
      return { ...indeterminate, execution: { status: 'not_executed', executed: false } };
    }

    // Outside the try/catch above: outcome now definitely exists, so any error from here on
    // (adaptation or an invariant violation) must propagate rather than be reported as
    // 'indeterminate' / not_executed, which would misrepresent whether executor already ran.
    const result = toKernelEnforcementResult(request.requestId, outcome.decision, outcome.result, options, request.correlationId);
    assertKernelInvariants(request, requestSnapshot, result);
    return result;
  }
}

export function createAocKernel(options: AocKernelOptions): AocKernel {
  return new AocKernel(options);
}
