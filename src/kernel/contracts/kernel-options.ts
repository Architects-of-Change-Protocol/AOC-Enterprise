/**
 * Only fields with real, verified backing in the wrapped engine are
 * included. `policyVersionOverride` and per-call clock overrides were
 * considered and deliberately omitted: the wrapped
 * `ActionEnforcementRuntime` only accepts a policy chain and a clock/id
 * generator at construction time, not per-evaluation -- see
 * `docs/kernel/AOC_KERNEL_INTEGRATION_GUIDE.md`.
 */
export interface KernelEvaluationOptions {
  /**
   * Mirrors `EnforcementMode = 'dry_run'`: the request is evaluated exactly
   * as normal, but if it would otherwise be allowed to execute, the
   * resulting status still reflects `allowed` while the underlying engine
   * records `dry_run_allowed` and never invokes an executor. Has no effect
   * on `evaluate()`, which never invokes an executor regardless.
   */
  readonly dryRun?: boolean;

  /**
   * 'basic' includes only pass/fail + reason codes per trace step.
   * 'full' additionally includes each step's raw `metadata` payload as
   * recorded by the wrapped engine's policy chain. Defaults to 'basic'.
   */
  readonly traceLevel?: 'basic' | 'full';
}
