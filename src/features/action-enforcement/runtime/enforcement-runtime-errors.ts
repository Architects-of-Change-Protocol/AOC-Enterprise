export class EnforcementRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class EnforcementRequestNotFoundError extends EnforcementRuntimeError {
  constructor(enforcementRequestId: string) {
    super(`Enforcement request not found: ${enforcementRequestId}`);
  }
}

export class EnforcementDecisionNotFoundError extends EnforcementRuntimeError {
  constructor(enforcementDecisionId: string) {
    super(`Enforcement decision not found: ${enforcementDecisionId}`);
  }
}

export class EnforcementAdapterNotFoundError extends EnforcementRuntimeError {
  constructor(adapterId: string) {
    super(`Enforcement adapter not found: ${adapterId}`);
  }
}

/**
 * Thrown when GuardedExecutionService cannot produce a required
 * post-execution record (ExecutionResult / EnforcementProof / events) for an
 * enforcement attempt. This must never happen in practice -- it signals a
 * runtime invariant violation, not a normal enforcement denial.
 */
export class PostExecutionRecordMissingError extends EnforcementRuntimeError {
  constructor(enforcementRequestId: string, reason: string) {
    super(`Post-execution record missing for enforcement request ${enforcementRequestId}: ${reason}`);
  }
}

/**
 * Thrown when application code attempts to run an executor callback outside
 * of GuardedExecutionService's own gated invocation path. Executor callbacks
 * must never run except as the single, explicit result of an allow decision.
 */
export class ExecutorInvokedWithoutAllowError extends EnforcementRuntimeError {
  constructor(enforcementRequestId: string) {
    super(`Refusing to invoke executor for enforcement request ${enforcementRequestId}: enforcement did not allow execution.`);
  }
}
