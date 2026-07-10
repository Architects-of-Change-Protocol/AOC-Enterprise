/**
 * Governance denial, approval-required, and indeterminate outcomes are
 * normal terminal results -- they are always returned as
 * `KernelEvaluationResult`, never thrown. These error classes exist only
 * for genuinely exceptional conditions: a malformed request, a
 * misconfigured kernel, an unexpected dependency failure, a violated
 * internal invariant, or an unclassified internal fault.
 */
export abstract class KernelError extends Error {
  abstract readonly code: string;
}

/** The `KernelEvaluationRequest` itself is structurally malformed (missing/empty `requestId`, `actor.id`, `actor.trustDomainId`, or `action.type`/`action.resourceScope`) -- this is checked at the kernel boundary before the wrapped engine is ever called. */
export class KernelValidationError extends KernelError {
  readonly code = 'KERNEL_VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'KernelValidationError';
  }
}

/** `AocKernel` was constructed without a required port (e.g. no `recognitionProvider`), or with an internally inconsistent option combination. */
export class KernelConfigurationError extends KernelError {
  readonly code = 'KERNEL_CONFIGURATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'KernelConfigurationError';
  }
}

/**
 * A configured dependency (recognition provider, policy pack provider)
 * threw or otherwise failed unexpectedly during evaluation. The wrapped
 * engine does not currently catch a throwing recognition provider (see
 * `AOC_KERNEL_CURRENT_EXECUTION_MODEL.md` sec. 14); the kernel catches it
 * at its own boundary and surfaces `status: 'indeterminate'` with
 * `KERNEL_INDETERMINATE` in the returned `KernelEvaluationResult` rather
 * than throwing -- this class is retained for callers of lower-level
 * kernel internals that choose not to go through `evaluate()`/`enforce()`.
 */
export class KernelDependencyError extends KernelError {
  readonly code = 'KERNEL_DEPENDENCY_ERROR';
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'KernelDependencyError';
  }
}

/** A documented kernel invariant (`docs/kernel/AOC_KERNEL_INVARIANTS_V1.md`) was violated by the wrapped engine's own output -- e.g. a decision claims `allowedToExecute` with no recognition ever having been performed. Indicates a bug in the wrapped engine or the kernel's adapter, not a governance outcome. */
export class KernelInvariantError extends KernelError {
  readonly code = 'KERNEL_INVARIANT_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'KernelInvariantError';
  }
}

/** An unclassified internal fault while executing the guarded `enforce()` adapter callback path (distinct from the callback itself throwing, which the wrapped engine already turns into `ExecutionResult.status = 'failed'` without throwing). */
export class KernelExecutionError extends KernelError {
  readonly code = 'KERNEL_EXECUTION_ERROR';
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'KernelExecutionError';
  }
}
