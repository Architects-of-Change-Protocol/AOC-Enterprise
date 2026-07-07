import type { EnforcementDecision } from './enforcement-decision.js';
import type { EnforcementProof } from './enforcement-proof.js';
import type { EnforcementRequest } from './enforcement-request.js';
import type { ExecutionResult } from './execution-result.js';

export interface EnforcementOutcome<T = unknown> {
  readonly request: EnforcementRequest;
  readonly decision: EnforcementDecision;
  readonly result: ExecutionResult<T>;
  readonly proof?: EnforcementProof;
}
