import type { EnterpriseModuleId } from '../modules/enterprise-module.js';

/**
 * The Enterprise lifecycle's own error taxonomy (mission section 7/37).
 * Deliberately distinct from `src/kernel/errors/kernel-errors.ts` -- a
 * lifecycle/infrastructure failure is never represented as a Kernel error,
 * and vice versa.
 */
export abstract class EnterpriseLifecycleError extends Error {
  abstract readonly code: string;
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class EnterpriseModuleRegistrationError extends EnterpriseLifecycleError {
  readonly code = 'MODULE_DUPLICATE';
  constructor(moduleId: EnterpriseModuleId) {
    super(`Module '${moduleId}' is already registered; duplicate module ids are rejected.`);
  }
}

export class EnterpriseModuleDependencyError extends EnterpriseLifecycleError {
  readonly code = 'MODULE_DEPENDENCY_MISSING';
  constructor(readonly violations: readonly string[]) {
    super(`Module dependency validation failed: ${violations.join('; ')}`);
  }
}

export class EnterpriseModuleCycleError extends EnterpriseLifecycleError {
  readonly code = 'MODULE_DEPENDENCY_CYCLE';
  constructor(readonly path: readonly EnterpriseModuleId[]) {
    super(`Dependency cycle detected:\n\n${path.join('\n→ ')}`);
  }
}

export interface EnterpriseModuleShutdownFailure {
  readonly moduleId: EnterpriseModuleId;
  readonly error: unknown;
}

export class EnterpriseModuleInitializationError extends EnterpriseLifecycleError {
  readonly code = 'MODULE_INITIALIZATION_FAILED';
  constructor(
    readonly moduleId: EnterpriseModuleId,
    override readonly cause: unknown,
    readonly initializedModuleIds: readonly EnterpriseModuleId[],
    readonly rollbackFailures: readonly EnterpriseModuleShutdownFailure[],
  ) {
    super(
      `Module '${moduleId}' failed to initialize: ${cause instanceof Error ? cause.message : String(cause)}` +
        (rollbackFailures.length > 0 ? ` (rollback also failed for: ${rollbackFailures.map((f) => f.moduleId).join(', ')})` : ''),
    );
  }
}

export class EnterpriseModuleStateError extends EnterpriseLifecycleError {
  readonly code = 'MODULE_INVALID_STATE';
  constructor(message: string) {
    super(message);
  }
}

export class EnterpriseModuleShutdownError extends EnterpriseLifecycleError {
  readonly code = 'MODULE_SHUTDOWN_FAILED';
  constructor(readonly failures: readonly EnterpriseModuleShutdownFailure[]) {
    super(`One or more modules failed to shut down: ${failures.map((f) => f.moduleId).join(', ')}`);
  }
}

export class EnterpriseNotReadyError extends EnterpriseLifecycleError {
  readonly code = 'ENTERPRISE_NOT_READY';
  constructor(readonly lifecycleState: string) {
    super(`AOC Enterprise is not ready to evaluate governance requests (lifecycleState='${lifecycleState}').`);
  }
}
