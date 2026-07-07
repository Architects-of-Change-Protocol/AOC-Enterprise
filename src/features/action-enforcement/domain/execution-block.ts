import type { EnforcementDecisionType } from './enforcement-decision.js';
import type { EnforcementViolationType } from './enforcement-violation.js';

/**
 * A deterministic record of "the executor callback was never invoked" --
 * produced whenever GuardedExecutionService declines to run the caller's
 * execute() callback (blocked, pending approval/evidence, dry-run, duplicate,
 * emergency deny, adapter denial, expiry). This is the audit-facing shape of
 * "no side effects before allow".
 */
export interface ExecutionBlock {
  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;
  readonly decisionType: EnforcementDecisionType;
  readonly violationType?: EnforcementViolationType;
  readonly reasonCode: string;
  readonly reason: string;
  readonly blockedAt: string;
}
